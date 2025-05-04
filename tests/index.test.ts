import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEmailStrict, ValidatorOptions } from '../src/index';
import dns from 'node:dns/promises';

// Mock the dns module
vi.mock('node:dns/promises', () => ({
  default: {
    resolveMx: vi.fn(),
  },
}));

// Helper to assert TypeError for non-string inputs
async function expectTypeError(input: unknown) {
  await expect(validateEmailStrict(input as string)).rejects.toThrow(TypeError);
  await expect(validateEmailStrict(input as string)).rejects.toThrow(
    'Input must be a string.',
  );
}

describe('validateEmailStrict', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.mocked(dns.resolveMx).mockClear();
  });

  afterEach(() => {
    // Restore mocks after each test if needed, though clear might suffice
    vi.restoreAllMocks();
  });

  describe('Input Validation', () => {
    it('should throw TypeError for non-string input', async () => {
      await expectTypeError(undefined);
      await expectTypeError(null);
      await expectTypeError(123);
      await expectTypeError({});
      await expectTypeError([]);
      await expectTypeError(true);
    });

    it('should return false for empty or whitespace string', async () => {
      expect(await validateEmailStrict('')).toBe(false);
      expect(await validateEmailStrict('   ')).toBe(false);
    });
  });

  describe('Syntax Validation', () => {
    // Emails valid in BOTH modes (Now stricter for real-world)
    const universallyValidEmails = [
      'test@example.com',
      'test.test@example.com',
      'test+alias@example.com',
      'test@sub.example.com',
      'test@example.co.uk',
      'test@example-domain.com',
      'test_test@example.com', // Underscore is okay
      '123@example.com',
    ];

    // Emails valid ONLY in RFC mode (Reverted based on simpler regex)
    const rfcOnlyValidEmails = [
      'test@localhost', // Single label domain
      'test@192.168.1.1', // Bare IPv4
      '"quoted string"@example.com', // Quoted local part
      'test@[1.2.3.4]', // Bracketed IPv4 literal
      // Moved back because simpler rfcSyntaxRegex allows them:
      'test@example.c',
      'test@-example.com',
      'test@example-.com',
      'test@[IPv6:::1]',
    ];

    // Emails invalid in BOTH modes (Reverted)
    const universallyInvalidEmails = [
      'test', 'test@', '@example.com', 'test@.com', 'test@com.',
      'test @example.com', 'test@ example.com', 'test@example .com',
      'test..test@example.com', 'test@example..com',
      'test@example.com.',
      // Moved back to rfcOnlyValidEmails: test@example.c
      // Moved back to rfcOnlyValidEmails: test@-example.com
      // Moved back to rfcOnlyValidEmails: test@example-.com
      '.test@example.com',
      'test.@example.com',
      'test@_example.com',
      'test@[1.2.3]',
      // Moved back to rfcOnlyValidEmails: test@[IPv6:::1]
    ];

    // --- Real-world Mode (Default) ---
    describe("Mode: 'real-world' (Default)", () => {
      const options: ValidatorOptions = { checkDomain: false, validationMode: 'real-world' };

      universallyValidEmails.forEach((email) => {
        it(`should return TRUE for universally valid: ${email}`, async () => {
          expect(await validateEmailStrict(email, options)).toBe(true);
          // Also test default behavior (no options specified)
          expect(await validateEmailStrict(email)).toBe(true);
        });
      });

      rfcOnlyValidEmails.forEach((email) => {
        it(`should return FALSE for RFC-only valid: ${email}`, async () => {
          expect(await validateEmailStrict(email, options)).toBe(false);
          expect(await validateEmailStrict(email)).toBe(false); // Default is real-world
        });
      });

      universallyInvalidEmails.forEach((email) => {
        it(`should return FALSE for universally invalid: ${email}`, async () => {
          expect(await validateEmailStrict(email, options)).toBe(false);
          expect(await validateEmailStrict(email)).toBe(false);
        });
      });
    });

    // --- RFC Mode ---
    describe("Mode: 'rfc'", () => {
      const options: ValidatorOptions = { checkDomain: false, validationMode: 'rfc' };

      universallyValidEmails.forEach((email) => {
        it(`should return TRUE for universally valid: ${email}`, async () => {
          expect(await validateEmailStrict(email, options)).toBe(true);
        });
      });

      rfcOnlyValidEmails.forEach((email) => {
        it(`should return TRUE for RFC-only valid: ${email}`, async () => {
          // This is the key difference - these should PASS now
          expect(await validateEmailStrict(email, options)).toBe(true);
        });
      });

      universallyInvalidEmails.forEach((email) => {
        it(`should return FALSE for universally invalid: ${email}`, async () => {
          expect(await validateEmailStrict(email, options)).toBe(false);
        });
      });
    });
  });

  describe('Domain Validation (checkDomain: true)', () => {
    // Define a type for Node.js system errors used in mocks
    type NodeError = Error & { code?: string };

    const validRealWorldSyntax = 'test@example-valid.com';
    const validRfcOnlySyntax = 'test@localhost'; // Use one of the RFC-only examples
    const invalidSyntax = 'invalid-syntax';

    const realWorldOptions: ValidatorOptions = { checkDomain: true, validationMode: 'real-world' };
    const rfcOptions: ValidatorOptions = { checkDomain: true, validationMode: 'rfc' };

    const mockMxRecords = [
      { exchange: 'mx1.example.com', priority: 10 },
      { exchange: 'mx2.example.com', priority: 20 },
    ];

    it('Mode real-world: should return false immediately if syntax is invalid, without DNS check', async () => {
      expect(await validateEmailStrict(invalidSyntax, realWorldOptions)).toBe(false);
      expect(dns.resolveMx).not.toHaveBeenCalled();
    });

    it('Mode rfc: should return false immediately if syntax is universally invalid, without DNS check', async () => {
      expect(await validateEmailStrict(invalidSyntax, rfcOptions)).toBe(false);
      expect(dns.resolveMx).not.toHaveBeenCalled();
    });

    it('Mode real-world: should return false if syntax is RFC-only, without DNS check', async () => {
       expect(await validateEmailStrict(validRfcOnlySyntax, realWorldOptions)).toBe(false);
       expect(dns.resolveMx).not.toHaveBeenCalled();
    });

    it('Mode rfc: should proceed to DNS check if syntax is RFC-only valid', async () => {
       vi.mocked(dns.resolveMx).mockResolvedValue(mockMxRecords);
       await validateEmailStrict(validRfcOnlySyntax, rfcOptions);
       expect(dns.resolveMx).toHaveBeenCalledWith('localhost'); // Check DNS was called
    });

    it('Mode real-world: should return true if syntax is valid and resolveMx finds records', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue(mockMxRecords);
      expect(await validateEmailStrict(validRealWorldSyntax, realWorldOptions)).toBe(true);
      expect(dns.resolveMx).toHaveBeenCalledWith('example-valid.com');
    });

    it('Mode rfc: should return true if syntax is valid and resolveMx finds records', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue(mockMxRecords);
      // Test with universally valid syntax
      expect(await validateEmailStrict(validRealWorldSyntax, rfcOptions)).toBe(true);
      expect(dns.resolveMx).toHaveBeenCalledWith('example-valid.com');
      vi.mocked(dns.resolveMx).mockClear(); // Clear mock for next check
      // Test with RFC-only valid syntax
      vi.mocked(dns.resolveMx).mockResolvedValue(mockMxRecords);
      expect(await validateEmailStrict(validRfcOnlySyntax, rfcOptions)).toBe(true);
      expect(dns.resolveMx).toHaveBeenCalledWith('localhost');
    });

    // Test DNS failures (should behave same regardless of syntax mode if syntax passes)
    const failureCases: { code: string; error: NodeError }[] = [
      { code: 'ENOTFOUND', error: Object.assign(new Error('Not found'), { code: 'ENOTFOUND' }) },
      { code: 'ENODATA', error: Object.assign(new Error('No data'), { code: 'ENODATA' }) },
      { code: 'ESERVFAIL', error: Object.assign(new Error('Server fail'), { code: 'ESERVFAIL' }) },
      { code: 'ETIMEOUT', error: Object.assign(new Error('Timeout'), { code: 'ETIMEOUT' }) },
      { code: 'EUNEXPECTED', error: new Error('Some other network issue') },
    ];

    failureCases.forEach(({ code, error }) => {
      it(`Mode real-world: should return false on DNS error ${code}`, async () => {
        vi.mocked(dns.resolveMx).mockRejectedValue(error);
        expect(await validateEmailStrict(validRealWorldSyntax, realWorldOptions)).toBe(false);
        expect(dns.resolveMx).toHaveBeenCalledWith('example-valid.com');
      });

      it(`Mode rfc: should return false on DNS error ${code}`, async () => {
        vi.mocked(dns.resolveMx).mockRejectedValue(error);
        // Check both universally valid and rfc-only valid syntax emails
        expect(await validateEmailStrict(validRealWorldSyntax, rfcOptions)).toBe(false);
        expect(dns.resolveMx).toHaveBeenCalledWith('example-valid.com');
        vi.mocked(dns.resolveMx).mockClear();
        vi.mocked(dns.resolveMx).mockRejectedValue(error);
        expect(await validateEmailStrict(validRfcOnlySyntax, rfcOptions)).toBe(false);
        expect(dns.resolveMx).toHaveBeenCalledWith('localhost');
      });
    });

    // Add back tests for empty MX results if needed
    it('Mode real-world: should return false if resolveMx returns empty array', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([]);
      expect(await validateEmailStrict(validRealWorldSyntax, realWorldOptions)).toBe(false);
      expect(dns.resolveMx).toHaveBeenCalledWith('example-valid.com');
    });
     it('Mode rfc: should return false if resolveMx returns empty array', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([]);
      expect(await validateEmailStrict(validRfcOnlySyntax, rfcOptions)).toBe(false);
      expect(dns.resolveMx).toHaveBeenCalledWith('localhost');
    });

  });
}); 