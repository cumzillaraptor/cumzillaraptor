const { createHash } = require('node:crypto');
const { PublicKey, Transaction, TransactionInstruction, SystemProgram, Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');

(async () => {
  const PROGRAM_ID = "AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY";
  const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
  const COLLECTION = "3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK";
  const TREASURY = "FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6";
  const programId = new PublicKey(PROGRAM_ID);
  const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  const config = pda([Buffer.from("config")]);
  const registry = pda([Buffer.from("allocation")]);
  const asset2 = pda([Buffer.from("asset"), Buffer.from([0, 2])]);

  const md = JSON.parse(fs.readFileSync('nft-data/metadata-merkle-v1.devnet.json', 'utf8'));
  const m2 = md.metadata['2'];
  console.log('mint #2:', m2.name, '| uri:', m2.uri, '| metadata proof:', m2.proof.length, 'elements');
  console.log('config PDA:', config.toBase58());
  console.log('registry PDA:', registry.toBase58());
  console.log('asset #2 PDA:', asset2.toBase58());

  const buyer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/tmp/cumz-rehearsal/buyer.json', 'utf8'))));
  console.log('buyer:', buyer.publicKey.toBase58());

  const u16le = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32le = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const strB = (s) => { const b = Buffer.from(s); return Buffer.concat([u32le(b.length), b]); };
  const vecB = (a) => Buffer.concat([u32le(a.length), ...a.map((h) => Buffer.from(h.slice(2), 'hex'))]);
  const disc = (n) => createHash('sha256').update('global:' + n).digest().subarray(0, 8);
  const mintData = Buffer.concat([disc('mint_nft'), u16le(2), strB(m2.name), strB(m2.uri), vecB(m2.proof)]);

  const ix = new TransactionInstruction({
    programId, keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(TREASURY), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(COLLECTION), isSigner: false, isWritable: true },
      { pubkey: asset2, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(CORE), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: mintData,
  });

  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const bh = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: buyer.publicKey, recentBlockhash: bh.blockhash }).add(ix);
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  console.log('tx bytes:', serialized.length, '(limit 1232)', serialized.length <= 1232 ? 'OK' : 'OVER');
  const fee = await conn.getFeeForMessage(tx.compileMessage(), 'confirmed');
  console.log('fee lamports:', fee.value);

  const before = await conn.getBalance(buyer.publicKey);
  const tb = await conn.getBalance(new PublicKey(TREASURY));
  console.log('buyer before:', (before/1e9).toFixed(6), 'SOL');
  console.log('treasury before:', (tb/1e9).toFixed(6), 'SOL');

  tx.sign(buyer);
  const sig = await conn.sendTransaction(tx, [buyer], { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('SENT signature:', sig);
  const conf = await conn.confirmTransaction(sig, 'confirmed');
  console.log('confirm:', JSON.stringify(conf.value.err) === 'null' ? 'SUCCESS' : 'FAILED ' + JSON.stringify(conf.value.err));
  const after = await conn.getBalance(buyer.publicKey);
  const tb2 = await conn.getBalance(new PublicKey(TREASURY));
  console.log('buyer after:', (after/1e9).toFixed(6), 'SOL (delta', ((before-after)/1e9).toFixed(6), ')');
  console.log('treasury after:', (tb2/1e9).toFixed(6), 'SOL (delta', ((tb2-tb)/1e9).toFixed(6), ')');
})();
