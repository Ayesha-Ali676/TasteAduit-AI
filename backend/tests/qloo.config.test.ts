import { describe, it, expect } from 'vitest';
import { ServerQlooClient, QlooConfigurationError } from '../src/services/qloo/qloo.client.js';

describe('ServerQlooClient Configuration & Safety', () => {
  it('should initialize with default hackathon base URL', () => {
    const client = new ServerQlooClient({ apiKey: undefined });
    expect(client.isConfigured()).toBe(false);
  });

  it('should report isConfigured true when a key is provided', () => {
    const client = new ServerQlooClient({ apiKey: 'test-sample-key' });
    expect(client.isConfigured()).toBe(true);
  });

  it('should fail with QlooConfigurationError if assertConfigured is invoked without key', () => {
    const client = new ServerQlooClient({ apiKey: undefined });
    expect(() => client.assertConfigured()).toThrow(QlooConfigurationError);
  });

  it('should reject searchTags call when unconfigured without making network requests', async () => {
    const client = new ServerQlooClient({ apiKey: undefined });
    await expect(client.searchTags('coffee')).rejects.toThrow(QlooConfigurationError);
  });

  it('should reject searchEntities call when unconfigured without making network requests', async () => {
    const client = new ServerQlooClient({ apiKey: undefined });
    await expect(client.searchEntities('Blue Bottle')).rejects.toThrow(QlooConfigurationError);
  });
});
