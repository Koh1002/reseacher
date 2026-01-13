// =============================================
// LLM Client Layer - Unified interface for GPT/Claude/Gemini
// =============================================

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Default models for each provider
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-flash',
};

/**
 * Unified LLM Client
 */
export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      ...config,
      model: config.model || DEFAULT_MODELS[config.provider],
    };
  }

  get provider(): LLMProvider {
    return this.config.provider;
  }

  get model(): string {
    return this.config.model || DEFAULT_MODELS[this.config.provider];
  }

  /**
   * Send a chat completion request
   */
  async chat(messages: LLMMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 2048 } = options || {};

    switch (this.config.provider) {
      case 'openai':
        return this.chatOpenAI(messages, temperature, maxTokens);
      case 'anthropic':
        return this.chatAnthropic(messages, temperature, maxTokens);
      case 'google':
        return this.chatGoogle(messages, temperature, maxTokens);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * OpenAI API call
   */
  private async chatOpenAI(
    messages: LLMMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('OpenAI API returned empty choices');
    }
    if (!data.choices[0].message?.content) {
      throw new Error('OpenAI API returned empty message content');
    }

    return {
      content: data.choices[0].message.content,
      provider: 'openai',
      model: this.config.model!,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }

  /**
   * Anthropic API call
   */
  private async chatAnthropic(
    messages: LLMMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    // Extract system message
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage?.content || '',
        messages: chatMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Anthropic API returned empty content');
    }
    if (!data.content[0].text) {
      throw new Error('Anthropic API returned empty text');
    }

    return {
      content: data.content[0].text,
      provider: 'anthropic',
      model: this.config.model!,
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * Google Gemini API call
   */
  private async chatGoogle(
    messages: LLMMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    // Convert messages to Gemini format
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const contents = chatMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMessage ? {
            parts: [{ text: systemMessage.content }],
          } : undefined,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      throw new Error('Google API returned no candidates');
    }
    if (!data.candidates[0].content?.parts || !Array.isArray(data.candidates[0].content.parts) || data.candidates[0].content.parts.length === 0) {
      throw new Error('Google API returned empty content parts');
    }
    if (!data.candidates[0].content.parts[0].text) {
      throw new Error('Google API returned empty text');
    }

    return {
      content: data.candidates[0].content.parts[0].text,
      provider: 'google',
      model: this.config.model!,
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}

/**
 * Create an LLM client from API keys
 */
export function createLLMClient(
  provider: LLMProvider,
  apiKey: string,
  model?: string
): LLMClient {
  return new LLMClient({ provider, apiKey, model });
}

/**
 * Get available providers from API keys
 */
export function getAvailableProviders(apiKeys: {
  openai?: string;
  anthropic?: string;
  google?: string;
}): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (apiKeys.openai) providers.push('openai');
  if (apiKeys.anthropic) providers.push('anthropic');
  if (apiKeys.google) providers.push('google');
  return providers;
}

/**
 * Randomly assign providers to agents
 */
export function assignProvidersToAgents(
  agentIds: string[],
  providers: LLMProvider[]
): Map<string, LLMProvider> {
  const assignments = new Map<string, LLMProvider>();

  if (providers.length === 0) {
    return assignments;
  }

  // Shuffle and assign
  agentIds.forEach((agentId, index) => {
    const provider = providers[index % providers.length];
    assignments.set(agentId, provider);
  });

  // Shuffle the assignments for randomness
  const entries = Array.from(assignments.entries());
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  return new Map(entries.map(([id], index) => [id, providers[index % providers.length]]));
}
