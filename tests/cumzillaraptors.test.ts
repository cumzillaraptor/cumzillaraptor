import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cumzillaraptors } from "../target/types/cumzillaraptors";
import { assert } from "chai";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { MerkleTree } from "merkletreejs";
import { keccak_256 } from "@noble/hashes/sha3";

describe("cumzillaraptors", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Cumzillaraptors as Program<Cumzillaraptors>;
  const wallet = provider.wallet;

  // Treasury address
  const TREASURY = new PublicKey("8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d");
  const MINT_PRICE = new anchor.BN(LAMPORTS_PER_SOL);

  // PDAs
  let configPda: PublicKey;
  let mintPoolPda: PublicKey;
  let claimVaultPda: PublicKey;
  let vaultAuthorityPda: PublicKey;

  // Merkle tree data (loaded from generated files)
  const claimProofs = require("../../nft-data/claim-proofs.json");
  const merkleConfig = require("../../nft-data/merkle-config.json");
  const mintPoolOrder = require("../../nft-data/mint-pool-order.json");

  before(async () => {
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    [mintPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_pool")],
      program.programId
    );
    [claimVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim_vault")],
      program.programId
    );
    [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority")],
      program.programId
    );

    // Airdrop SOL to wallet for testing
    const sig = await provider.connection.requestAirdrop(
      wallet.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("initializes the config", async () => {
    const merkleRootBytes = new Uint8Array(merkleConfig.rootBytes);

    await program.methods
      .initialize({
        mintPrice: MINT_PRICE,
        treasury: TREASURY,
        merkleRoot: merkleRootBytes,
        collectionMint: wallet.publicKey, // placeholder for now
      })
      .accounts({
        config: configPda,
        authority: wallet.publicKey,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert(config.treasury.equals(TREASURY));
    assert(config.mintPrice.eq(MINT_PRICE));
    assert.equal(config.mintCount, 0);
    assert.equal(config.claimCount, 0);
    assert(!config.claimsReady);
  });

  it("initializes the mint pool", async () => {
    const order = mintPoolOrder.order;

    await program.methods
      .initMintPool({ order })
      .accounts({
        config: configPda,
        mintPool: mintPoolPda,
        authority: wallet.publicKey,
      })
      .rpc();

    const pool = await program.account.mintPool.fetch(mintPoolPda);
    assert.equal(pool.order.length, 247);
    assert.equal(pool.nextIndex, 0);
  });

  it("pre-mints claim vault", async () => {
    await program.methods
      .preMintClaims()
      .accounts({
        config: configPda,
        claimVault: claimVaultPda,
        vaultAuthority: vaultAuthorityPda,
        authority: wallet.publicKey,
        collectionMint: wallet.publicKey,
        mplCoreProgram: new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"),
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert(config.claimsReady);

    const vault = await program.account.claimVault.fetch(claimVaultPda);
    assert(vault.vaultAuthority.equals(vaultAuthorityPda));
  });

  it("mints a random NFT (pays 1 SOL)", async () => {
    const user = Keypair.generate();

    // Airdrop SOL to user
    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    const balanceBefore = await provider.connection.getBalance(TREASURY);

    await program.methods
      .mintRandom()
      .accounts({
        config: configPda,
        mintPool: mintPoolPda,
        user: user.publicKey,
      })
      .signers([user])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(TREASURY);
    assert.equal(
      balanceAfter - balanceBefore,
      LAMPORTS_PER_SOL
    );

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.mintCount, 1);

    const pool = await program.account.mintPool.fetch(mintPoolPda);
    assert.equal(pool.nextIndex, 1);
  });

  it("claims an NFT with valid merkle proof", async () => {
    // Pick the first claim from our data
    const claimKey = Object.keys(claimProofs)[0];
    const claim = claimProofs[claimKey];

    // Parse eth address to bytes
    const ethAddressBytes = new Uint8Array(
      claim.ethAddress.replace("0x", "").match(/.{2}/g).map(b => parseInt(b, 16))
    );
    const nftNumber = claim.nftNumber;

    // Parse proofs
    const proof = claim.proof.map((p: string) => {
      const hex = p.replace("0x", "");
      return new Uint8Array(hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    });

    const claimer = Keypair.generate();
    const claimSig = await provider.connection.requestAirdrop(claimer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(claimSig);

    await program.methods
      .claimNft({
        ethAddress: ethAddressBytes,
        nftNumber,
        proof,
      })
      .accounts({
        config: configPda,
        claimVault: claimVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: claimer.publicKey,
      })
      .signers([claimer])
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.equal(config.claimCount, 1);

    // Verify it's marked as claimed in the vault
    const vault = await program.account.claimVault.fetch(claimVaultPda);
    assert(vault.isClaimed(nftNumber - 1));
  });

  it("rejects invalid merkle proof", async () => {
    const fakeEthAddress = new Uint8Array(20).fill(0xab);
    const fakeProof = [new Uint8Array(32).fill(0xff)];

    try {
      await program.methods
        .claimNft({
          ethAddress: fakeEthAddress,
          nftNumber: 1,
          proof: fakeProof,
        })
        .accounts({
          config: configPda,
          claimVault: claimVaultPda,
          vaultAuthority: vaultAuthorityPda,
          user: wallet.publicKey,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (e) {
      assert(e.message.includes("InvalidMerkleProof"));
    }
  });

  it("prevents double-claiming", async () => {
    const claimKey = Object.keys(claimProofs)[1];
    const claim = claimProofs[claimKey];

    const ethAddressBytes = new Uint8Array(
      claim.ethAddress.replace("0x", "").match(/.{2}/g).map(b => parseInt(b, 16))
    );
    const proof = claim.proof.map((p: string) => {
      const hex = p.replace("0x", "");
      return new Uint8Array(hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    });

    const claimer = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(claimer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);

    // First claim should succeed
    await program.methods
      .claimNft({
        ethAddress: ethAddressBytes,
        nftNumber: claim.nftNumber,
        proof,
      })
      .accounts({
        config: configPda,
        claimVault: claimVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: claimer.publicKey,
      })
      .signers([claimer])
      .rpc();

    // Second claim should fail (AlreadyClaimed)
    try {
      await program.methods
        .claimNft({
          ethAddress: ethAddressBytes,
          nftNumber: claim.nftNumber,
          proof,
        })
        .accounts({
          config: configPda,
          claimVault: claimVaultPda,
          vaultAuthority: vaultAuthorityPda,
          user: claimer.publicKey,
        })
        .signers([claimer])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e) {
      assert(e.message.includes("AlreadyClaimed"));
    }
  });

  it("withdraws funds to treasury", async () => {
    const treasuryBalanceBefore = await provider.connection.getBalance(TREASURY);

    await program.methods
      .withdraw()
      .accounts({
        config: configPda,
        treasury: TREASURY,
        authority: wallet.publicKey,
      })
      .rpc();

    const treasuryBalanceAfter = await provider.connection.getBalance(TREASURY);
    assert(treasuryBalanceAfter > treasuryBalanceBefore);
  });
});
