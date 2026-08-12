//! Synthetic descriptor model for the pre-transfer portion of the v2 bootstrap contract.
//!
//! This crate models refusal gates and descriptor validation only. It has no host integration,
//! configuration inputs, transfer behavior, or filesystem implementation. Production system-call
//! enforcement is deferred; this synthetic trait cannot prove actual system-call behavior.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BootstrapRefusal {
    NotEffectiveRoot,
    CallerInputPresent,
    Openat2Unavailable,
    ResolutionViolation,
    NotRegularFile,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DescriptorFault {
    ResolutionViolation,
    AdapterFault,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileKind {
    Regular,
    Directory,
    Symlink,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelativeComponent {
    ApprovedSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelativeFile {
    ApprovedArtifact,
}

/// Opaque model identity for the one fixed synthetic root.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SyntheticRootIdentity {
    _sealed: (),
}

impl SyntheticRootIdentity {
    #[must_use]
    pub const fn is_fixed_synthetic_root(&self) -> bool {
        true
    }
}

const FIXED_SYNTHETIC_ROOT_IDENTITY: SyntheticRootIdentity = SyntheticRootIdentity { _sealed: () };

/// Opaque root descriptor token; distinct from component and file tokens.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RootDescriptor {
    _sealed: (),
}

impl RootDescriptor {
    pub const SYNTHETIC_FIXED: Self = Self { _sealed: () };
}

/// Opaque component descriptor token; distinct from root and file tokens.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DirectoryDescriptor {
    _sealed: (),
}

impl DirectoryDescriptor {
    pub const SYNTHETIC_COMPONENT: Self = Self { _sealed: () };
}

/// Opaque file descriptor token; distinct from root and component tokens.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FileDescriptor {
    _sealed: (),
}

impl FileDescriptor {
    pub const SYNTHETIC_FILE: Self = Self { _sealed: () };
}

/// Opaque capability proof issued only after `require_openat2` succeeds.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Openat2 {
    _sealed: (),
}

impl Openat2 {
    const ISSUED: Self = Self { _sealed: () };
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EntryFacts {
    effective_root: bool,
    caller_arguments_present: bool,
}

impl EntryFacts {
    #[must_use]
    pub const fn effective_root_without_arguments() -> Self {
        Self {
            effective_root: true,
            caller_arguments_present: false,
        }
    }

    #[must_use]
    pub const fn not_effective_root() -> Self {
        Self {
            effective_root: false,
            caller_arguments_present: false,
        }
    }

    #[must_use]
    pub const fn effective_root_with_arguments() -> Self {
        Self {
            effective_root: true,
            caller_arguments_present: true,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RunRecord {
    EntryFacts,
    RequireOpenat2,
    AcquireFixedRoot,
    OpenBeneathNoSymlinks { component: RelativeComponent },
    OpenSourceBeneathNoSymlinks { file: RelativeFile },
    FstatSourceFile,
}

/// Synthetic descriptor adapter boundary.
///
/// The capability proof is issued by this model immediately after `require_openat2` succeeds and
/// is required by each resolution operation. This trait is only a synthetic contract: production
/// system-call enforcement is deferred, and an implementation cannot use it to prove that an
/// actual system call supplied these guarantees.
pub trait DescriptorAdapter {
    fn entry_facts(&mut self) -> EntryFacts;

    /// # Errors
    ///
    /// Returns an adapter fault when the required capability is unavailable.
    fn require_openat2(&mut self) -> Result<(), DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the fixed-root acquisition cannot be modeled.
    fn acquire_fixed_root(
        &mut self,
        identity: &SyntheticRootIdentity,
    ) -> Result<RootDescriptor, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the component cannot satisfy this resolution contract.
    fn open_beneath_no_symlinks(
        &mut self,
        capability: &Openat2,
        parent: &RootDescriptor,
        component: RelativeComponent,
    ) -> Result<DirectoryDescriptor, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the source cannot satisfy this resolution contract.
    fn open_source_beneath_no_symlinks(
        &mut self,
        capability: &Openat2,
        parent: &DirectoryDescriptor,
        file: RelativeFile,
    ) -> Result<FileDescriptor, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the held file descriptor cannot be inspected.
    fn fstat_file(&mut self, file: &FileDescriptor) -> Result<FileKind, DescriptorFault>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ValidatedSource {
    file: FileDescriptor,
}

impl ValidatedSource {
    #[must_use]
    pub const fn is_descriptor_validated(&self) -> bool {
        let _ = self.file;
        true
    }
}

/// # Errors
///
/// Returns a non-echoing refusal if the entry gate fails, the model capability is absent,
/// descriptor resolution fails, or the held file is not regular.
pub fn acquire_validated_source<A: DescriptorAdapter>(
    adapter: &mut A,
) -> Result<ValidatedSource, BootstrapRefusal> {
    let facts = adapter.entry_facts();
    if !facts.effective_root {
        return Err(BootstrapRefusal::NotEffectiveRoot);
    }
    if facts.caller_arguments_present {
        return Err(BootstrapRefusal::CallerInputPresent);
    }

    adapter
        .require_openat2()
        .map_err(|_| BootstrapRefusal::Openat2Unavailable)?;
    let capability = Openat2::ISSUED;
    let root = adapter
        .acquire_fixed_root(&FIXED_SYNTHETIC_ROOT_IDENTITY)
        .map_err(|_| BootstrapRefusal::ResolutionViolation)?;
    let component = adapter
        .open_beneath_no_symlinks(&capability, &root, RelativeComponent::ApprovedSource)
        .map_err(|_| BootstrapRefusal::ResolutionViolation)?;
    let file = adapter
        .open_source_beneath_no_symlinks(&capability, &component, RelativeFile::ApprovedArtifact)
        .map_err(|_| BootstrapRefusal::ResolutionViolation)?;

    match adapter
        .fstat_file(&file)
        .map_err(|_| BootstrapRefusal::ResolutionViolation)?
    {
        FileKind::Regular => Ok(ValidatedSource { file }),
        FileKind::Directory | FileKind::Symlink | FileKind::Other => {
            Err(BootstrapRefusal::NotRegularFile)
        }
    }
}
