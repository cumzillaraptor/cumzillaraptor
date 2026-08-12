const MODEL_SOURCE: &str = include_str!("../src/lib.rs");
const TEST_SOURCE: &str = include_str!("bootstrap_refusal.rs");

use v2_descriptor_pinned_bootstrap::{
    BootstrapRefusal, DescriptorAdapter, DescriptorFault, DirectoryDescriptor, EntryFacts,
    FileDescriptor, FileKind, RelativeComponent, RelativeFile, RootDescriptor, RunRecord,
    StageFileIdentity, StageParentDescriptor, SyntheticRootIdentity, acquire_validated_source,
    verify_validated_source_to_fresh_stage,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TreeNode {
    Directory,
    RegularFile,
    Symlink,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SyntheticExistence {
    Absent,
    Present,
}

#[derive(Clone, Copy)]
struct SyntheticSnapshot {
    root: TreeNode,
    component: TreeNode,
    file: TreeNode,
}

impl SyntheticSnapshot {
    const APPROVED: Self = Self {
        root: TreeNode::Directory,
        component: TreeNode::Directory,
        file: TreeNode::RegularFile,
    };
}

struct FakeAdapter {
    facts: EntryFacts,
    openat2_supported: bool,
    snapshot: SyntheticSnapshot,
    fault_secret: Option<&'static str>,
    accepted_fixed_identity: bool,
    source_bytes: Vec<u8>,
    source_declared_size: Option<usize>,
    staged_bytes: Option<Vec<u8>>,
    staged_read_bytes: Option<Vec<u8>>,
    staged_declared_size: Option<usize>,
    ignore_read_bound: bool,
    last_source_max_bytes: Option<usize>,
    last_staged_max_bytes: Option<usize>,
    source_clone_count: usize,
    staged_clone_count: usize,
    stage_write_count: usize,
    last_stage_write_byte_count: Option<usize>,
    reported_stage_write_count: Option<usize>,
    stage_exists: SyntheticExistence,
    destination_exists: SyntheticExistence,
    stage_kind: FileKind,
    calls: Vec<RunRecord>,
}

impl FakeAdapter {
    fn approved() -> Self {
        Self {
            facts: EntryFacts::effective_root_without_arguments(),
            openat2_supported: true,
            snapshot: SyntheticSnapshot::APPROVED,
            fault_secret: None,
            accepted_fixed_identity: false,
            source_bytes: b"synthetic-only".to_vec(),
            source_declared_size: None,
            staged_bytes: None,
            staged_read_bytes: None,
            staged_declared_size: None,
            ignore_read_bound: false,
            last_source_max_bytes: None,
            last_staged_max_bytes: None,
            source_clone_count: 0,
            staged_clone_count: 0,
            stage_write_count: 0,
            last_stage_write_byte_count: None,
            reported_stage_write_count: None,
            stage_exists: SyntheticExistence::Absent,
            destination_exists: SyntheticExistence::Absent,
            stage_kind: FileKind::Regular,
            calls: Vec::new(),
        }
    }

    fn set_component_node(&mut self, node: TreeNode) {
        self.snapshot.component = node;
    }

    fn set_file_node(&mut self, node: TreeNode) {
        self.snapshot.file = node;
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

    fn stage_exists(&mut self) -> Result<bool, DescriptorFault> {
        self.calls.push(RunRecord::InspectStageExistence);
        Ok(self.stage_exists == SyntheticExistence::Present)
    }

    fn destination_exists(&mut self) -> Result<bool, DescriptorFault> {
        self.calls.push(RunRecord::InspectDestinationExistence);
        Ok(self.destination_exists == SyntheticExistence::Present)
    }

    fn acquire_approved_stage_parent(&mut self) -> Result<StageParentDescriptor, DescriptorFault> {
        self.calls.push(RunRecord::AcquireApprovedStageParent);
        Ok(StageParentDescriptor::SYNTHETIC_APPROVED)
    }

    fn create_exclusive_stage_no_follow(
        &mut self,
        _parent: &StageParentDescriptor,
        _identity: &StageFileIdentity,
    ) -> Result<FileDescriptor, DescriptorFault> {
        self.calls.push(RunRecord::CreateExclusiveStageNoFollow);
        if self.stage_exists == SyntheticExistence::Present {
            return Err(DescriptorFault::AdapterFault);
        }
        self.stage_exists = SyntheticExistence::Present;
        Ok(FileDescriptor::SYNTHETIC_STAGE)
    }

    fn read_validated_source_bytes(
        &mut self,
        _file: &FileDescriptor,
        max_bytes: usize,
    ) -> Result<Vec<u8>, DescriptorFault> {
        self.calls.push(RunRecord::ReadValidatedSource);
        self.last_source_max_bytes = Some(max_bytes);
        if !self.ignore_read_bound
            && self.source_declared_size.unwrap_or(self.source_bytes.len()) > max_bytes
        {
            return Err(DescriptorFault::ByteLimitExceeded);
        }
        self.source_clone_count += 1;
        Ok(self.source_bytes.clone())
    }

    fn write_stage_bytes(
        &mut self,
        _stage: &FileDescriptor,
        bytes: &[u8],
    ) -> Result<usize, DescriptorFault> {
        self.calls.push(RunRecord::WriteStage);
        self.stage_write_count += 1;
        self.last_stage_write_byte_count = Some(bytes.len());
        self.staged_bytes = Some(bytes.to_vec());
        Ok(self.reported_stage_write_count.unwrap_or(bytes.len()))
    }

    fn fstat_stage_file(&mut self, _stage: &FileDescriptor) -> Result<FileKind, DescriptorFault> {
        self.calls.push(RunRecord::FstatStageFile);
        Ok(self.stage_kind)
    }

    fn read_staged_bytes(
        &mut self,
        _stage: &FileDescriptor,
        max_bytes: usize,
    ) -> Result<Vec<u8>, DescriptorFault> {
        self.calls.push(RunRecord::ReadStaged);
        self.last_staged_max_bytes = Some(max_bytes);
        let staged_bytes = self
            .staged_read_bytes
            .as_ref()
            .or(self.staged_bytes.as_ref())
            .ok_or(DescriptorFault::AdapterFault)?;
        if !self.ignore_read_bound
            && self.staged_declared_size.unwrap_or(staged_bytes.len()) > max_bytes
        {
            return Err(DescriptorFault::ByteLimitExceeded);
        }
        self.staged_clone_count += 1;
        Ok(staged_bytes.clone())
    }

    fn record_staged_hash(&mut self) {
        self.calls.push(RunRecord::HashStaged);
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
    let mut adapter = FakeAdapter::approved();
    adapter.facts = EntryFacts::not_effective_root();

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::NotEffectiveRoot)
    );
    assert_eq!(adapter.calls(), &[RunRecord::EntryFacts]);
}

#[test]
fn caller_arguments_refuse_exactly_before_any_descriptor_open() {
    let mut adapter = FakeAdapter::approved();
    adapter.facts = EntryFacts::effective_root_with_arguments();

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::CallerInputPresent)
    );
    assert_eq!(adapter.calls(), &[RunRecord::EntryFacts]);
}

#[test]
fn unavailable_openat2_refuses_without_any_open_method() {
    let mut adapter = FakeAdapter::approved();
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
    let mut adapter = FakeAdapter::approved();
    adapter.set_component_node(TreeNode::Symlink);

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
    let mut adapter = FakeAdapter::approved();
    adapter.set_file_node(TreeNode::Symlink);

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
    let mut adapter = FakeAdapter::approved();
    adapter.set_file_node(TreeNode::Directory);

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::NotRegularFile)
    );
    assert!(adapter.calls().contains(&RunRecord::FstatSourceFile));
}

#[test]
fn other_source_snapshot_is_not_a_regular_file() {
    let mut adapter = FakeAdapter::approved();
    adapter.set_file_node(TreeNode::Other);

    assert_eq!(
        acquire_validated_source(&mut adapter),
        Err(BootstrapRefusal::NotRegularFile)
    );
    assert!(adapter.calls().contains(&RunRecord::FstatSourceFile));
}

#[test]
fn validated_regular_source_uses_fixed_identity_proof_and_distinct_fixed_tokens() {
    let mut adapter = FakeAdapter::approved();

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
    let mut adapter = FakeAdapter::approved();
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
fn changed_source_cannot_pass_without_postcopy_seal_match() {
    let mut adapter = FakeAdapter::approved();
    let source = acquire_validated_source(&mut adapter).expect("validate original held source");
    adapter.source_bytes = b"changed-after-validation".to_vec();

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::PostCopySealMismatch)
    );
    assert_eq!(
        adapter.staged_bytes,
        Some(b"changed-after-validation".to_vec())
    );
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
            RunRecord::InspectStageExistence,
            RunRecord::InspectDestinationExistence,
            RunRecord::AcquireApprovedStageParent,
            RunRecord::CreateExclusiveStageNoFollow,
            RunRecord::ReadValidatedSource,
            RunRecord::WriteStage,
            RunRecord::FstatStageFile,
            RunRecord::ReadStaged,
            RunRecord::HashStaged,
        ]
    );
}

#[test]
fn preexisting_stage_or_destination_denies_without_reuse() {
    let mut stage_adapter = FakeAdapter::approved();
    stage_adapter.stage_exists = SyntheticExistence::Present;
    let source = acquire_validated_source(&mut stage_adapter).expect("validate source");
    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut stage_adapter, source),
        Err(BootstrapRefusal::StageAlreadyExists)
    );
    assert_eq!(
        stage_adapter.calls().last(),
        Some(&RunRecord::InspectStageExistence)
    );
    assert!(stage_adapter.staged_bytes.is_none());

    let mut destination_adapter = FakeAdapter::approved();
    destination_adapter.destination_exists = SyntheticExistence::Present;
    let source = acquire_validated_source(&mut destination_adapter).expect("validate source");
    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut destination_adapter, source),
        Err(BootstrapRefusal::DestinationAlreadyExists)
    );
    assert_eq!(
        destination_adapter.calls().last(),
        Some(&RunRecord::InspectDestinationExistence)
    );
    assert!(destination_adapter.staged_bytes.is_none());
}

#[test]
fn copy_uses_a_fresh_synthetic_approved_parent() {
    let mut adapter = FakeAdapter::approved();
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert!(verify_validated_source_to_fresh_stage(&mut adapter, source).is_ok());
    assert_eq!(adapter.staged_bytes, Some(b"synthetic-only".to_vec()));
    assert!(
        adapter
            .calls()
            .contains(&RunRecord::AcquireApprovedStageParent)
    );
    assert!(
        adapter
            .calls()
            .contains(&RunRecord::CreateExclusiveStageNoFollow)
    );
}

#[test]
fn source_bytes_over_the_cap_refuse_before_stage_write() {
    let mut adapter = FakeAdapter::approved();
    adapter.source_declared_size = Some(1_048_577);
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::SourceTooLarge)
    );
    assert!(adapter.calls().contains(&RunRecord::ReadValidatedSource));
    assert!(!adapter.calls().contains(&RunRecord::WriteStage));
    assert!(adapter.staged_bytes.is_none());
    assert_eq!(adapter.last_source_max_bytes, Some(1_048_576));
    assert_eq!(adapter.source_clone_count, 0);
}

#[test]
fn exact_1mib_source_flows_through_bounded_copy_before_authoritative_seal_rejection() {
    const MAX_TRANSFER_BYTES: usize = 1_048_576;

    let mut adapter = FakeAdapter::approved();
    let payload = vec![0xa5; MAX_TRANSFER_BYTES];
    adapter.source_bytes = payload.clone();
    let source = acquire_validated_source(&mut adapter).expect("validate exact-boundary source");

    let result = verify_validated_source_to_fresh_stage(&mut adapter, source);

    // The fixed private seal covers only `b"synthetic-only"`; the boundary payload must flow
    // through the bounded transfer and then be rejected by the authoritative post-copy seal.
    assert_eq!(result, Err(BootstrapRefusal::PostCopySealMismatch));
    assert_ne!(result, Err(BootstrapRefusal::SourceTooLarge));
    assert_ne!(result, Err(BootstrapRefusal::StageTooLarge));
    assert_eq!(adapter.last_source_max_bytes, Some(MAX_TRANSFER_BYTES));
    assert_eq!(adapter.source_clone_count, 1);
    assert_eq!(
        adapter
            .calls()
            .iter()
            .filter(|call| **call == RunRecord::ReadValidatedSource)
            .count(),
        1
    );
    assert_eq!(adapter.stage_write_count, 1);
    assert_eq!(
        adapter.last_stage_write_byte_count,
        Some(MAX_TRANSFER_BYTES)
    );
    assert_eq!(adapter.staged_bytes.as_deref(), Some(payload.as_slice()));
    assert_eq!(
        adapter
            .calls()
            .iter()
            .filter(|call| **call == RunRecord::FstatStageFile)
            .count(),
        1
    );
    assert_eq!(adapter.last_staged_max_bytes, Some(MAX_TRANSFER_BYTES));
    assert_eq!(adapter.staged_clone_count, 1);
    assert_eq!(
        adapter
            .calls()
            .iter()
            .filter(|call| **call == RunRecord::ReadStaged)
            .count(),
        1
    );
    assert_eq!(
        adapter
            .calls()
            .iter()
            .filter(|call| **call == RunRecord::HashStaged)
            .count(),
        1
    );
}

#[test]
fn staged_bytes_over_the_cap_refuse_before_hash_without_copying_them() {
    let mut adapter = FakeAdapter::approved();
    adapter.staged_declared_size = Some(1_048_577);
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::StageTooLarge)
    );
    assert_eq!(adapter.last_source_max_bytes, Some(1_048_576));
    assert_eq!(adapter.last_staged_max_bytes, Some(1_048_576));
    assert!(adapter.calls().contains(&RunRecord::ReadStaged));
    assert!(!adapter.calls().contains(&RunRecord::HashStaged));
    assert_eq!(adapter.staged_clone_count, 0);
}

#[test]
fn nonregular_created_stage_refuses_before_postcopy_read() {
    let mut adapter = FakeAdapter::approved();
    adapter.stage_kind = FileKind::Directory;
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::StageNotRegularFile)
    );
    assert!(adapter.calls().contains(&RunRecord::FstatStageFile));
    assert!(!adapter.calls().contains(&RunRecord::ReadStaged));
}

#[test]
fn short_reported_stage_write_refuses_before_stage_inspection_or_hashing() {
    let mut adapter = FakeAdapter::approved();
    adapter.reported_stage_write_count = Some(b"synthetic-onl".len());
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::TransferFault)
    );
    assert!(adapter.calls().contains(&RunRecord::WriteStage));
    assert!(!adapter.calls().contains(&RunRecord::FstatStageFile));
    assert!(!adapter.calls().contains(&RunRecord::ReadStaged));
    assert!(!adapter.calls().contains(&RunRecord::HashStaged));
}

#[test]
fn over_reported_stage_write_refuses_before_stage_inspection_or_hashing() {
    let mut adapter = FakeAdapter::approved();
    adapter.reported_stage_write_count = Some(b"synthetic-only".len() + 1);
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::TransferFault)
    );
    assert!(adapter.calls().contains(&RunRecord::WriteStage));
    assert!(!adapter.calls().contains(&RunRecord::FstatStageFile));
    assert!(!adapter.calls().contains(&RunRecord::ReadStaged));
    assert!(!adapter.calls().contains(&RunRecord::HashStaged));
}

#[test]
fn nonconforming_source_vec_over_cap_refuses_before_write_or_hash() {
    let mut adapter = FakeAdapter::approved();
    adapter.ignore_read_bound = true;
    adapter.source_bytes = vec![0xa5; 1_048_577];
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::SourceTooLarge)
    );
    assert!(adapter.calls().contains(&RunRecord::ReadValidatedSource));
    assert!(!adapter.calls().contains(&RunRecord::WriteStage));
    assert!(!adapter.calls().contains(&RunRecord::HashStaged));
}

#[test]
fn nonconforming_staged_vec_over_cap_refuses_before_hash() {
    let mut adapter = FakeAdapter::approved();
    adapter.ignore_read_bound = true;
    adapter.staged_read_bytes = Some(vec![0xa5; 1_048_577]);
    let source = acquire_validated_source(&mut adapter).expect("validate source");

    assert_eq!(
        verify_validated_source_to_fresh_stage(&mut adapter, source),
        Err(BootstrapRefusal::StageTooLarge)
    );
    assert!(adapter.calls().contains(&RunRecord::WriteStage));
    assert!(adapter.calls().contains(&RunRecord::FstatStageFile));
    assert!(adapter.calls().contains(&RunRecord::ReadStaged));
    assert!(!adapter.calls().contains(&RunRecord::HashStaged));
}

#[test]
fn validated_source_public_shape_is_single_use_and_documents_synthetic_trust_boundary() {
    let source = MODEL_SOURCE;
    assert!(
        !source
            .contains("#[derive(Clone, Copy, Debug, Eq, PartialEq)]\npub struct ValidatedSource"),
        "ValidatedSource must not derive Clone or Copy"
    );
    assert!(source.contains("Adapters MUST NOT transfer a"));
    assert!(source.contains("proof between adapter instances."));
    assert!(
        source
            .contains("Public synthetic descriptor constants are only trusted adapter test tokens")
    );
    assert!(source.contains("capabilities."));
}

#[test]
fn production_model_source_has_no_runtime_or_fallback_capabilities() {
    let source = MODEL_SOURCE;
    for forbidden in [
        concat!("std::", "env"),
        concat!("std::", "process"),
        "Command",
        concat!("std::", "fs"),
        concat!("std::", "net"),
        "openat(",
        "fallback",
        "retry",
        "rename(",
        "execute(",
        "spawn(",
        "solana",
    ] {
        assert!(
            !source.contains(forbidden),
            "forbidden capability: {forbidden}"
        );
    }
}

#[test]
fn synthetic_marker_tests_do_not_use_host_interfaces() {
    // These tests exercise only FakeAdapter's in-memory marker model, not filesystem syscall
    // behavior. Keep the fixture free of host interfaces as the model evolves.
    for forbidden in [
        concat!("std::", "fs"),
        concat!("std::", "env"),
        concat!("std::", "process"),
        concat!("std::", "time"),
        concat!("std::", "os"),
        concat!("std::", "net"),
        concat!("fs", "::"),
        concat!("env", "::"),
        concat!("process", "::"),
        concat!("time", "::"),
        concat!("os", "::"),
    ] {
        assert!(
            !TEST_SOURCE.contains(forbidden),
            "synthetic test fixture must not use host interface: {forbidden}"
        );
    }
}
