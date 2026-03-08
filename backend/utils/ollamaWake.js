/**
 * Invoke the Ollama wake Lambda so the ASG scales from 0 to 1 when running on EC2 (Blue/Green).
 * Set OLLAMA_WAKE_LAMBDA to the Terraform output lambda_ollama_controller_name (e.g. AMS-OSCAL-ollama-controller).
 * Optional: AWS_REGION (defaults to us-east-1).
 *
 * @returns {Promise<boolean>} true if Lambda was invoked successfully, false if not configured or invoke failed
 */
export async function invokeOllamaWake() {
  const functionName = process.env.OLLAMA_WAKE_LAMBDA || process.env.OLLAMA_WAKE_LAMBDA_FUNCTION;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/d9aa6c43-16c6-410a-a033-1d844263f7e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ollamaWake.js:invokeOllamaWake:entry',message:'invokeOllamaWake called',data:{functionName:functionName||'(empty)',region,hasFunctionName:!!(functionName&&functionName.trim())},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  if (!functionName || !functionName.trim()) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/d9aa6c43-16c6-410a-a033-1d844263f7e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ollamaWake.js:invokeOllamaWake:earlyExit',message:'OLLAMA_WAKE_LAMBDA not set',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return false;
  }
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const client = new LambdaClient({ region });
    const payload = JSON.stringify({ action: 'wake' });
    await client.send(
      new InvokeCommand({
        FunctionName: functionName.trim(),
        InvocationType: 'RequestResponse',
        Payload: payload
      })
    );
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/d9aa6c43-16c6-410a-a033-1d844263f7e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ollamaWake.js:invokeOllamaWake:success',message:'Lambda invoke succeeded',data:{functionName:functionName.trim(),region},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    console.log(`Ollama wake Lambda invoked (${functionName}). ASG will scale up; wait ~2–3 min for instance and NLB target healthy.`);
    return true;
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/d9aa6c43-16c6-410a-a033-1d844263f7e7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ollamaWake.js:invokeOllamaWake:fail',message:'Lambda invoke failed',data:{errorMessage:err?.message,errorCode:err?.code,errorName:err?.name},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    console.warn('Ollama wake Lambda invoke failed:', err.message);
    return false;
  }
}
