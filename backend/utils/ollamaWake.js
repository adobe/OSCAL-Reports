/**
 * Invoke the Ollama wake Lambda so the ASG scales from 0 to 1 when running on EC2 (Blue/Green).
 * Set OLLAMA_WAKE_LAMBDA to the Terraform output lambda_ollama_controller_name (e.g. AMS-OSCAL-ollama-controller).
 * Optional: AWS_REGION (defaults to us-east-1).
 *
 * @returns {Promise<boolean>} true if Lambda was invoked successfully, false if not configured or invoke failed
 */
export async function invokeOllamaWake() {
  const functionName = process.env.OLLAMA_WAKE_LAMBDA || process.env.OLLAMA_WAKE_LAMBDA_FUNCTION;
  if (!functionName || !functionName.trim()) {
    return false;
  }
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const client = new LambdaClient({ region });
    const payload = JSON.stringify({ action: 'wake' });
    await client.send(
      new InvokeCommand({
        FunctionName: functionName.trim(),
        InvocationType: 'RequestResponse',
        Payload: payload
      })
    );
    console.log(`Ollama wake Lambda invoked (${functionName}). ASG will scale up; wait ~2–3 min for instance and NLB target healthy.`);
    return true;
  } catch (err) {
    console.warn('Ollama wake Lambda invoke failed:', err.message);
    return false;
  }
}
