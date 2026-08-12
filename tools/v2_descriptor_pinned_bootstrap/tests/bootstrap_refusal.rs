use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use v2_descriptor_pinned_bootstrap::{
    BootstrapRefusal, DescriptorAdapter, DescriptorFault, DirectoryDescriptor, EntryFacts,
    FileDescriptor, FileKind, RelativeComponent, RelativeFile, RootDescriptor, RunRecord,
    SyntheticRootIdentity, acquire_validated_source,
};

static TEMPORARY_TREE_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TemporaryTree {
    root: PathBuf,
}

impl TemporaryTree {
    fn new() -> Self {
        let counter = TEMPORARY_TREE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "descriptor-model-{}-{timestamp}-{counter}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("create temporary synthetic tree");
        Self { root }
    }

    fn approved_tree(&self) {
        fs::create_dir(self.component_path()).expect("create component marker");
        fs::write(self.file_path(), b"synthetic-only").expect("create file marker");
    }

    fn replace_component_with_symlink(&self) {
        fs::remove_dir_all(self.component_path()).expect("remove component marker");
        Self::symlink_marker(&self.component_path());
    }

    fn replace_file_with_symlink(&self) {
        fs::remove_file(self.file_path()).expect("remove file marker");
        Self::symlink_marker(&self.file_path());
    }

    fn replace_file_with_directory(&self) {
        fs::remove_file(self.file_path()).expect("remove file marker");
        fs::create_dir(self.file_path()).expect("create directory marker");
    }

    fn component_path(&self) -> PathBuf {
        self.root.join("approved-source")
    }

    fn file_path(&self) -> PathBuf {
        self.component_path().join("approved-artifact")
    }

    fn symlink_marker(marker: &Path) {
        #[cfg(unix)]
        std::os::unix::fs::symlink("not-followed", marker)
            .expect("create synthetic symlink marker");
    }
}

impl Drop for TemporaryTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TreeNode {
    Directory,
    RegularFile,
    Symlink,
    Other,
}

impl TreeNode {
    fn from_marker(marker: &Path) -> Self {
        let metadata = fs::symlink_metadata(marker);
        let file_type = match metadata {
            Ok(metadata) => metadata.file_type(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Self::Other,
            Err(error) => panic!("scan synthetic marker metadata: {error}"),
        };
        if file_type.is_symlink() {
            Self::Symlink
        } else if file_type.is_dir() {
            Self::Directory
        } else if file_type.is_file() {
            Self::RegularFile
        } else {
            Self::Other
        }
    }
}

#[derive(Clone, Copy)]
struct SyntheticSnapshot {
    root: TreeNode,
    component: TreeNode,
    file: TreeNode,
}

impl SyntheticSnapshot {
    fn from_tree(tree: &TemporaryTree) -> Self {
        Self {
            root: TreeNode::from_marker(&tree.root),
            component: TreeNode::from_marker(&tree.component_path()),
            file: TreeNode::from_marker(&tree.file_path()),
        }
    }
}

struct FakeAdapter {
    facts: EntryFacts,
    openat2_supported: bool,
    snapshot: SyntheticSnapshot,
    fault_secret: Option<&'static str>,
    accepted_fixed_identity: bool,
    calls: Vec<RunRecord>,
}

impl FakeAdapter {
    fn approved_tree(tree: &TemporaryTree) -> Self {
        tree.approved_tree();
        Self {
            facts: EntryFacts::effective_root_without_arguments(),
            openat2_supported: true,
            snapshot: SyntheticSnapshot::from_tree(tree),
            fault_secret: None,
            accepted_fixed_identity: false,
            calls: Vec::new(),
        }
    }

    fn refresh_snapshot(&mut self, tree: &TemporaryTree) {
        self.snapshot = SyntheticSnapshot::from_tree(tree);
    }

    fn calls(&self) -> &[RunRecord] {
        &self.calls
    }
}

impl DescriptorAdapter for FakeAdapter {
    fn entry_facts(&mut self) -> EntryFacts {
        self.calls.push(RunRecord::EntryFacts);
        self.facts
    }

    fn require_openat2(&mut self) -> Result<(), DescriptorFault> {
        self.calls.push(RunRecord::RequireOpenat2);
        self.openat2_supported
            .then_some(())
            .ok_or(DescriptorFault::AdapterFault)
    }

    fn acquire_fixed_root(
        &mut self,
        identity: &SyntheticRootIdentity,
    ) -> Result<RootDescriptor, DescriptorFault> {
        self.calls.push(RunRecord::AcquireFixedRoot);
        self.accepted_fixed_identity = identity.is_fixed_synthetic_root();
        if self.accepted_fixed_identity && self.snapshot.root == TreeNode::Directory {
            Ok(RootDescriptor::SYNTHETIC_FIXED)
        } else {
            Err(DescriptorFault::AdapterFault)
        }
    }

    fn open_beneath_no_symlinks(
        &mut self,
        _capability: &v2_descriptor_pinned_bootstrap::Openat2,
        _parent: &RootDescriptor,
        component: RelativeComponent,
    ) -> Result<DirectoryDescriptor, DescriptorFault> {
        self.calls
            .push(RunRecord::OpenBeneathNoSymlinks { component });
        match self.snapshot.component {
            TreeNode::Directory => Ok(DirectoryDescriptor::SYNTHETIC_COMPONENT),
            TreeNode::RegularFile | TreeNode::Symlink | TreeNode::Other => {
                Err(DescriptorFault::ResolutionViolation)
            }
        }
    }

    fn open_source_beneath_no_symlinks(
        &mut self,
        _capability: &v2_descriptor_pinned_bootstrap::Openat2,
        _parent: &DirectoryDescriptor,
        file: RelativeFile,
    ) -> Result<FileDescriptor, DescriptorFault> {
        self.calls
            .push(RunRecord::OpenSourceBeneathNoSymlinks { file });
        match self.snapshot.file {
            TreeNode::Symlink => Err(DescriptorFault::ResolutionViolation),
            TreeNode::RegularFile | TreeNode::Directory | TreeNode::Other => {
                Ok(FileDescriptor::SYNTHETIC_FILE)
            }
        }
    }

    fn fstat_file(&mut self, _file: &FileDescriptor) -> Result<FileKind, DescriptorFault> {
        self.calls.push(RunRecord::FstatSourceFile);
        if self.fault_secret.is_some() {
            return Err(DescriptorFault::AdapterFault);
        }
        Ok(self.snapshot.file.into())
    }
}

impl From<TreeNode> for FileKind {
    fn from(value: TreeNode) -> Self {
        match value {
            TreeNode::RegularFile => Self::Regular,
            TreeNode::Directory => Self::Directory,
            TreeNode::Symlink => Self::Symlink,
            TreeNode::Other => Self::Other,
        }
    }
}

#[test]
fn non_root_refuses_exactly_before_any_descriptor_open() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    adapter.facts = EntryFacts::not_effective_root();

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::NotEffectiveRoot)
    );
    assert_eq!(adapter.calls(), &[RunRecord::EntryFacts]);
}

#[test]
fn caller_arguments_refuse_exactly_before_any_descriptor_open() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    adapter.facts = EntryFacts::effective_root_with_arguments();

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::CallerInputPresent)
    );
    assert_eq!(adapter.calls(), &[RunRecord::EntryFacts]);
}

#[test]
fn unavailable_openat2_refuses_without_any_open_method() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    adapter.openat2_supported = false;

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::Openat2Unavailable)
    );
    assert_eq!(
        adapter.calls(),
        &[RunRecord::EntryFacts, RunRecord::RequireOpenat2]
    );
}

#[test]
fn symlinked_component_snapshot_refuses_before_source_file_open() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    tree.replace_component_with_symlink();
    adapter.refresh_snapshot(&tree);

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::ResolutionViolation)
    );
    assert!(matches!(
        adapter.calls().last(),
        Some(RunRecord::OpenBeneathNoSymlinks { .. })
    ));
    assert!(!adapter.calls().iter().any(|call| matches!(
        call,
        RunRecord::OpenSourceBeneathNoSymlinks { .. } | RunRecord::FstatSourceFile
    )));
}

#[test]
fn symlinked_source_file_snapshot_refuses_before_validated_handle_is_returned() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    tree.replace_file_with_symlink();
    adapter.refresh_snapshot(&tree);

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::ResolutionViolation)
    );
    assert!(matches!(
        adapter.calls().last(),
        Some(RunRecord::OpenSourceBeneathNoSymlinks { .. })
    ));
    assert!(!adapter.calls().contains(&RunRecord::FstatSourceFile));
}

#[test]
fn directory_source_snapshot_is_not_a_regular_file() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    tree.replace_file_with_directory();
    adapter.refresh_snapshot(&tree);

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::NotRegularFile)
    );
    assert!(adapter.calls().contains(&RunRecord::FstatSourceFile));
}

#[test]
fn validated_regular_source_uses_fixed_identity_proof_and_distinct_fixed_tokens() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);

    let source = acquire_validated_source(&mut adapter).expect("regular source accepted");
    assert!(source.is_descriptor_validated());
    assert!(adapter.accepted_fixed_identity);
    assert_eq!(
        adapter.calls(),
        &[
            RunRecord::EntryFacts,
            RunRecord::RequireOpenat2,
            RunRecord::AcquireFixedRoot,
            RunRecord::OpenBeneathNoSymlinks {
                component: RelativeComponent::ApprovedSource,
            },
            RunRecord::OpenSourceBeneathNoSymlinks {
                file: RelativeFile::ApprovedArtifact,
            },
            RunRecord::FstatSourceFile,
        ]
    );
}

#[test]
fn adapter_fault_triggered_by_secret_is_redacted_from_refusal_debug() {
    let tree = TemporaryTree::new();
    let mut adapter = FakeAdapter::approved_tree(&tree);
    let secret = "credential=super-secret-content";
    adapter.fault_secret = Some(secret);

    let result = acquire_validated_source(&mut adapter);
    assert_eq!(result, Err(BootstrapRefusal::ResolutionViolation));
    let rendered = format!("{result:?}");
    for forbidden in [secret, "credential", "content"] {
        assert!(
            !rendered.contains(forbidden),
            "typed refusal leaked {forbidden}"
        );
    }
}

#[test]
fn production_model_source_has_no_runtime_or_fallback_capabilities() {
    let source = fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("read model source for capability audit");
    for forbidden in [
        "std::env",
        "std::process",
        "Command",
        "std::fs",
        "std::net",
        "openat(",
        "fallback",
        "retry",
        "path",
        "copy",
        "create",
        "destination",
        "stage",
        "execute",
    ] {
        assert!(
            !source.contains(forbidden),
            "forbidden capability: {forbidden}"
        );
    }
}
