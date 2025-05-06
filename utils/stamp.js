export function makeStamper() {
  const t0 = Date.now();
  return (label, sess='', call='') =>
    console.log(`[+${(Date.now()-t0).toString().padStart(5)} ms] ${label}`,
                sess, call);
}
