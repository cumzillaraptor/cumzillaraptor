// One-time shared ALT creation: create + extend as two separate transactions,
// with correct sequencing and confirmation between steps. Run from the Pi.
const { Connection, PublicKey, Transaction, AddressLookupTableProgram, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const c = new Connection('https://api.devnet.solana.com', 'confirmed');
const PROGRAM_ID = new PublicKey('AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY');

async function confirmSig(sig, tries = 20) {
  for (let i = 0; i < tries; i++) {
    await sleep(2500);
    try {
      const st = await c.getSignatureStatuses([sig]);
      const s = st.value[0];
      if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) {
        if (s.err) throw new Error('on-chain error: ' + JSON.stringify(s.err));
        return;
      }
    } catch (e) {
      if (String(e.message).includes('on-chain error')) throw e;
      // rate limited — keep waiting
    }
  }
  throw new Error('confirmation timed out (tx may still land later)');
}

(async () => {
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/cumzillaraptors-devnet-payer-v2.json', 'utf8'))));
  console.log('payer:', payer.publicKey.toBase58());
  const addresses = [
    PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0],
    PublicKey.findProgramAddressSync([Buffer.from('allocation')], PROGRAM_ID)[0],
    new PublicKey('3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK'),
    new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'),
  ];

  // Step 1: pick a recent slot, derive the address, check existence
  const slot = await c.getSlot('finalized');
  const recentSlot = slot - 3;
  const sb = Buffer.alloc(4); sb.writeUInt32LE(recentSlot);
  const [alt] = PublicKey.findProgramAddressSync([sb], AddressLookupTableProgram.programId);
  let t = await c.getAddressLookupTable(alt).catch(() => null);

  if (!t?.value) {
    console.log('creating ALT', alt.toBase58(), '(recentSlot', recentSlot + ')…');
    const [createIx] = AddressLookupTableProgram.createLookupTable({
      payer: payer.publicKey, authority: payer.publicKey, recentSlot,
    });
    const tx = new Transaction().add(createIx);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
    tx.sign(payer);
    const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    console.log('create sig:', sig.slice(0, 20) + '…');
    await confirmSig(sig);
    console.log('create confirmed.');
    await sleep(3000);
  }

  t = await c.getAddressLookupTable(alt).catch(() => null);
  const have = t?.value ? t.value.state.addresses.map(a => a.toBase58()) : [];
  const missing = addresses.filter(a => !have.includes(a.toBase58()));
  if (missing.length) {
    console.log('extending with', missing.length, 'addresses…');
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey, authority: payer.publicKey, lookupTable: alt, addresses: missing,
    });
    const tx2 = new Transaction().add(extendIx);
    tx2.feePayer = payer.publicKey;
    tx2.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
    tx2.sign(payer);
    const sig2 = await c.sendRawTransaction(tx2.serialize(), { skipPreflight: false });
    console.log('extend sig:', sig2.slice(0, 20) + '…');
    await confirmSig(sig2);
  }

  // wait for activation
  let final = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    final = await c.getAddressLookupTable(alt).catch(() => null);
    if (final?.value && final.value.state.addresses.length >= 4) break;
  }
  if (!final?.value || final.value.state.addresses.length < 4) throw new Error('activation timeout');

  console.log('\n=== SHARED CLAIM ALT READY ===');
  console.log('ADDRESS:', alt.toBase58());
  console.log('ENTRIES:');
  final.value.state.addresses.forEach((a, i) => console.log(' ', i, a.toBase58()));
})().catch(e => { console.error('FAILED:', String(e.message).slice(0, 300)); process.exit(1); });
