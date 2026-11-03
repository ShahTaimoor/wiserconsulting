/**
 * The Groq implementation of the AI provider adapter.
 *
 * A provider is two small functions: `build` turns a prompt into a request (address, headers, body) and `parse` turns
 * the provider's answer into { text, finish, model }. Groq's API is OpenAI-compatible, so it is a plain HTTPS POST with
 * a Bearer key; no SDK. The address is the constant in config/ai.js. The key is only ever put in the Authorization
 * header and is never part of an error, a log line or a result.
 */

const { GROQ_URL, LIMITS } = require('../../config/ai');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

module.exports = {
  id: 'groq',

  /** { system, user } -> { url, headers, body } */
  build(settings, prompt) {
    return {
      url: GROQ_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: LIMITS.temperature,
        max_completion_tokens: LIMITS.maxOutputTokens,
        stream: false,
      }),
    };
  },

  /** The provider's JSON -> { text, finish, model }, or null when it is not the shape of a chat answer. */
  parse(json) {
    if (!isObject(json) || !Array.isArray(json.choices) || json.choices.length === 0) return null;
    const choice = json.choices[0];
    if (!isObject(choice) || !isObject(choice.message) || typeof choice.message.content !== 'string') return null;
    return {
      text: choice.message.content,
      finish: typeof choice.finish_reason === 'string' ? choice.finish_reason : '',
      model: typeof json.model === 'string' ? json.model.slice(0, 100) : '',
    };
  },
};
