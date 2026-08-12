//! Synthetic descriptor model for a pinned v2 bootstrap transfer contract.
//!
//! This crate models descriptor validation, exclusive synthetic staging, and release-seal refusal
//! gates only. It has no host integration or filesystem implementation. Final destination rename
//! and execution are deliberately deferred from this synthetic-only Task4b model.

const MAX_TRANSFER_BYTES: usize = 1_048_576;
const FIXED_SYNTHETIC_RELEASE_SEAL: [u8; 32] = [
    0xde, 0x98, 0x85, 0x8e, 0x30, 0xe4, 0x41, 0x36, 0x0c, 0x33, 0xc0, 0x64, 0x43, 0xd0, 0x0e, 0x76,
    0x6f, 0xf7, 0x1b, 0xc6, 0x10, 0x23, 0x96, 0x5d, 0xb7, 0x8e, 0xb8, 0x1a, 0xad, 0x0d, 0x62, 0xae,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BootstrapRefusal {
    NotEffectiveRoot,
    CallerInputPresent,
    Openat2Unavailable,
    ResolutionViolation,
    NotRegularFile,
    StageAlreadyExists,
    DestinationAlreadyExists,
    SourceTooLarge,
    StageTooLarge,
    StageNotRegularFile,
    PostCopySealMismatch,
    TransferFault,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DescriptorFault {
    ResolutionViolation,
    ByteLimitExceeded,
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
    pub const SYNTHETIC_STAGE: Self = Self { _sealed: () };
}

/// Opaque retained approved-parent descriptor for synthetic staging.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StageParentDescriptor {
    _sealed: (),
}

impl StageParentDescriptor {
    pub const SYNTHETIC_APPROVED: Self = Self { _sealed: () };
}

/// Opaque fixed identity passed only to synthetic stage creation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StageFileIdentity {
    _sealed: (),
}

const FIXED_SYNTHETIC_STAGE_FILE: StageFileIdentity = StageFileIdentity { _sealed: () };

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
    InspectStageExistence,
    InspectDestinationExistence,
    AcquireApprovedStageParent,
    CreateExclusiveStageNoFollow,
    ReadValidatedSource,
    WriteStage,
    FstatStageFile,
    ReadStaged,
    HashStaged,
}

/// Synthetic descriptor adapter boundary.
///
/// This trait is only a synthetic contract. Its operations cannot prove actual system-call
/// guarantees. Stage creation represents `O_CREAT|O_EXCL|O_NOFOLLOW` semantics without invoking
/// host APIs. Public synthetic descriptor constants are only trusted adapter test tokens, not
/// capabilities. They exist so a conforming synthetic adapter can return opaque values while
/// exercising this model; real descriptor constants and host enforcement are out of scope.
///
/// This generic API cannot statically bind a `ValidatedSource` to the particular adapter instance
/// that issued it without a broader adapter lifecycle refactor. Adapters MUST NOT transfer a
/// `ValidatedSource` proof between adapter instances. This is a narrow trusted synthetic-adapter
/// limitation and does not claim cross-adapter security.
pub trait DescriptorAdapter {
    fn entry_facts(&mut self) -> EntryFacts;

    /// # Errors
    ///
    /// Returns an adapter fault when the required capability is unavailable.
    fn require_openat2(&mut self) -> Result<(), DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when fixed-root acquisition cannot be modeled.
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

    /// # Errors
    ///
    /// Returns an adapter fault when the fixed synthetic stage already exists check fails.
    fn stage_exists(&mut self) -> Result<bool, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the fixed synthetic destination already exists check fails.
    fn destination_exists(&mut self) -> Result<bool, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the retained approved parent cannot be acquired.
    fn acquire_approved_stage_parent(&mut self) -> Result<StageParentDescriptor, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when exclusive no-follow stage creation cannot be modeled.
    fn create_exclusive_stage_no_follow(
        &mut self,
        parent: &StageParentDescriptor,
        identity: &StageFileIdentity,
    ) -> Result<FileDescriptor, DescriptorFault>;

    /// # Errors
    ///
    /// Refuses with [`DescriptorFault::ByteLimitExceeded`] when the held descriptor contains more
    /// than `max_bytes`; an implementation must make that decision before allocating or returning
    /// the descriptor bytes. Otherwise returns raw bytes only from the already validated held
    /// source descriptor.
    fn read_validated_source_bytes(
        &mut self,
        file: &FileDescriptor,
        max_bytes: usize,
    ) -> Result<Vec<u8>, DescriptorFault>;

    /// # Errors
    ///
    /// Returns the exact byte count written to the held synthetic stage descriptor.
    fn write_stage_bytes(
        &mut self,
        stage: &FileDescriptor,
        bytes: &[u8],
    ) -> Result<usize, DescriptorFault>;

    /// # Errors
    ///
    /// Returns an adapter fault when the held stage descriptor cannot be inspected.
    fn fstat_stage_file(&mut self, stage: &FileDescriptor) -> Result<FileKind, DescriptorFault>;

    /// # Errors
    ///
    /// Refuses with [`DescriptorFault::ByteLimitExceeded`] when the held descriptor contains more
    /// than `max_bytes`; an implementation must make that decision before allocating or returning
    /// the descriptor bytes. Otherwise returns raw bytes from the held synthetic stage descriptor.
    fn read_staged_bytes(
        &mut self,
        stage: &FileDescriptor,
        max_bytes: usize,
    ) -> Result<Vec<u8>, DescriptorFault>;

    /// Records that local post-copy hashing is about to be performed in this synthetic model.
    fn record_staged_hash(&mut self);
}

#[derive(Debug, Eq, PartialEq)]
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
/// Returns a non-echoing refusal if the entry gate fails, model capability is absent,
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

/// Copies a validated held source into a fresh synthetic stage and checks its fixed release seal.
///
/// The source capability is consumed here and its descriptor is never exposed to callers.
/// No final destination action is modeled.
///
/// # Errors
///
/// Returns a typed, non-echoing refusal for existence, descriptor, byte-bound, write-count, or
/// release-seal failures.
#[allow(clippy::needless_pass_by_value)] // Moving the non-Copy proof enforces one public use.
pub fn verify_validated_source_to_fresh_stage<A: DescriptorAdapter>(
    adapter: &mut A,
    source: ValidatedSource,
) -> Result<(), BootstrapRefusal> {
    let ValidatedSource { file } = source;
    if adapter
        .stage_exists()
        .map_err(|_| BootstrapRefusal::TransferFault)?
    {
        return Err(BootstrapRefusal::StageAlreadyExists);
    }
    if adapter
        .destination_exists()
        .map_err(|_| BootstrapRefusal::TransferFault)?
    {
        return Err(BootstrapRefusal::DestinationAlreadyExists);
    }

    let parent = adapter
        .acquire_approved_stage_parent()
        .map_err(|_| BootstrapRefusal::TransferFault)?;
    let stage = adapter
        .create_exclusive_stage_no_follow(&parent, &FIXED_SYNTHETIC_STAGE_FILE)
        .map_err(|_| BootstrapRefusal::TransferFault)?;
    let bytes = adapter
        .read_validated_source_bytes(&file, MAX_TRANSFER_BYTES)
        .map_err(|fault| match fault {
            DescriptorFault::ByteLimitExceeded => BootstrapRefusal::SourceTooLarge,
            DescriptorFault::ResolutionViolation | DescriptorFault::AdapterFault => {
                BootstrapRefusal::TransferFault
            }
        })?;
    if bytes.len() > MAX_TRANSFER_BYTES {
        return Err(BootstrapRefusal::SourceTooLarge);
    }
    let written = adapter
        .write_stage_bytes(&stage, &bytes)
        .map_err(|_| BootstrapRefusal::TransferFault)?;
    if written != bytes.len() {
        return Err(BootstrapRefusal::TransferFault);
    }
    if adapter
        .fstat_stage_file(&stage)
        .map_err(|_| BootstrapRefusal::TransferFault)?
        != FileKind::Regular
    {
        return Err(BootstrapRefusal::StageNotRegularFile);
    }
    let staged = adapter
        .read_staged_bytes(&stage, MAX_TRANSFER_BYTES)
        .map_err(|fault| match fault {
            DescriptorFault::ByteLimitExceeded => BootstrapRefusal::StageTooLarge,
            DescriptorFault::ResolutionViolation | DescriptorFault::AdapterFault => {
                BootstrapRefusal::TransferFault
            }
        })?;
    if staged.len() > MAX_TRANSFER_BYTES {
        return Err(BootstrapRefusal::StageTooLarge);
    }
    adapter.record_staged_hash();
    let seal = sha256(&staged);
    if seal != FIXED_SYNTHETIC_RELEASE_SEAL {
        return Err(BootstrapRefusal::PostCopySealMismatch);
    }
    Ok(())
}

fn sha256(input: &[u8]) -> [u8; 32] {
    let mut state = [
        0x6a09_e667_u32,
        0xbb67_ae85,
        0x3c6e_f372,
        0xa54f_f53a,
        0x510e_527f,
        0x9b05_688c,
        0x1f83_d9ab,
        0x5be0_cd19,
    ];
    let mut message = input.to_vec();
    let Ok(byte_length) = u64::try_from(input.len()) else {
        return [0; 32];
    };
    let bit_length = byte_length.saturating_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_length.to_be_bytes());

    for block in message.chunks_exact(64) {
        let mut words = [0_u32; 64];
        for (index, word) in words[..16].iter_mut().enumerate() {
            let offset = index * 4;
            *word = u32::from_be_bytes([
                block[offset],
                block[offset + 1],
                block[offset + 2],
                block[offset + 3],
            ]);
        }
        for index in 16..64 {
            let small0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let small1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(small0)
                .wrapping_add(words[index - 7])
                .wrapping_add(small1);
        }

        let mut working = state;
        for (index, constant) in SHA256_CONSTANTS.iter().enumerate() {
            let big1 = working[4].rotate_right(6)
                ^ working[4].rotate_right(11)
                ^ working[4].rotate_right(25);
            let choice = (working[4] & working[5]) ^ ((!working[4]) & working[6]);
            let temp1 = working[7]
                .wrapping_add(big1)
                .wrapping_add(choice)
                .wrapping_add(*constant)
                .wrapping_add(words[index]);
            let big0 = working[0].rotate_right(2)
                ^ working[0].rotate_right(13)
                ^ working[0].rotate_right(22);
            let majority =
                (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2]);
            let temp2 = big0.wrapping_add(majority);
            working = [
                temp1.wrapping_add(temp2),
                working[0],
                working[1],
                working[2],
                working[3].wrapping_add(temp1),
                working[4],
                working[5],
                working[6],
            ];
        }
        for (value, addition) in state.iter_mut().zip(working) {
            *value = value.wrapping_add(addition);
        }
    }

    let mut output = [0_u8; 32];
    for (index, value) in state.iter().enumerate() {
        output[index * 4..(index + 1) * 4].copy_from_slice(&value.to_be_bytes());
    }
    output
}

const SHA256_CONSTANTS: [u32; 64] = [
    0x428a_2f98,
    0x7137_4491,
    0xb5c0_fbcf,
    0xe9b5_dba5,
    0x3956_c25b,
    0x59f1_11f1,
    0x923f_82a4,
    0xab1c_5ed5,
    0xd807_aa98,
    0x1283_5b01,
    0x2431_85be,
    0x550c_7dc3,
    0x72be_5d74,
    0x80de_b1fe,
    0x9bdc_06a7,
    0xc19b_f174,
    0xe49b_69c1,
    0xefbe_4786,
    0x0fc1_9dc6,
    0x240c_a1cc,
    0x2de9_2c6f,
    0x4a74_84aa,
    0x5cb0_a9dc,
    0x76f9_88da,
    0x983e_5152,
    0xa831_c66d,
    0xb003_27c8,
    0xbf59_7fc7,
    0xc6e0_0bf3,
    0xd5a7_9147,
    0x06ca_6351,
    0x1429_2967,
    0x27b7_0a85,
    0x2e1b_2138,
    0x4d2c_6dfc,
    0x5338_0d13,
    0x650a_7354,
    0x766a_0abb,
    0x81c2_c92e,
    0x9272_2c85,
    0xa2bf_e8a1,
    0xa81a_664b,
    0xc24b_8b70,
    0xc76c_51a3,
    0xd192_e819,
    0xd699_0624,
    0xf40e_3585,
    0x106a_a070,
    0x19a4_c116,
    0x1e37_6c08,
    0x2748_774c,
    0x34b0_bcb5,
    0x391c_0cb3,
    0x4ed8_aa4a,
    0x5b9c_ca4f,
    0x682e_6ff3,
    0x748f_82ee,
    0x78a5_636f,
    0x84c8_7814,
    0x8cc7_0208,
    0x90be_fffa,
    0xa450_6ceb,
    0xbef9_a3f7,
    0xc671_78f2,
];

#[cfg(test)]
mod sha256_tests {
    use std::fmt::Write as _;

    use super::sha256;

    fn digest_hex(input: &[u8]) -> String {
        input
            .iter()
            .fold(String::with_capacity(64), |mut hex, byte| {
                write!(&mut hex, "{byte:02x}").expect("write hash hex into string");
                hex
            })
    }

    #[test]
    fn known_vectors_cover_empty_single_and_multiblock_messages() {
        for (input, expected) in [
            (
                &b""[..],
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            ),
            (
                &b"abc"[..],
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ),
            (
                &b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"[..],
                "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            ),
        ] {
            assert_eq!(digest_hex(&sha256(input)), expected);
        }
    }

    #[test]
    fn padding_boundary_vectors_cover_55_and_56_byte_messages() {
        assert_eq!(
            digest_hex(&sha256(&[b'a'; 55])),
            "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"
        );
        assert_eq!(
            digest_hex(&sha256(&[b'a'; 56])),
            "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"
        );
    }
}
