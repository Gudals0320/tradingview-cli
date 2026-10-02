/** Self-contained page helper: timeout does not retire an unfinished action. */
export async function trackNativeOperation(window, token, action) {
  const operations = window.__tvCliNativeOperations ||= {};
  // A single unresolved entry is the cap. Never retire it by age: it is a fence,
  // and deleting it would permit overlapping work. Settled entries are removed.
  if (Object.keys(operations).length >= 1) throw new Error('NATIVE_BUSY: Native operation registry cap (1) reached; verify the prior action quiescence.');
  const operation = operations[token] = { pending: true };
  operation.promise = Promise.resolve().then(action);
  let extended=false;
  const retire=()=>{if(operations[token]===operation)delete operations[token];};
  try {
    const result=await operation.promise;
    if(operation.tail_promise){extended=true;Promise.resolve(operation.tail_promise).then(retire,retire);}
    return result;
  } finally {if(!extended)retire();}
}
