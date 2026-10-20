const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export async function callDeepseekMarket(input, env) {
  const key = String(env.DEEPSEEK_KEY || env.DEEPSEEK_API_KEY || '');
  if (!key) throw new Error('deepseek_not_configured');

  const body = {
    model: 'deepseek-flash',
    messages: Array.isArray(input?.messages) ? input.messages : [],
    thinking: { type: 'disabled' },
    temperature: 0.2,
    max_tokens: Math.min(Math.max(Number(input?.max_tokens) || 2200, 256), 3200),
  };
  if (Array.isArray(input?.tools)) body.tools = input.tools;
  if (input?.tool_choice != null) body.tool_choice = input.tool_choice;
  if (input?.response_format?.type === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  let res;
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`deepseek_fetch_failed: ${err?.message ?? err}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('deepseek_invalid_json');
  }
}
