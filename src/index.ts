import dns from 'node:dns/promises';

/**
 * Specifies the validation strictness level.
 * - 'real-world': (Default) Stricter validation rejecting formats like `user@localhost`, `user@ip_address`, quoted local parts, and IP literals. Allows underscores.
 * - 'rfc': More permissive validation allowing formats rejected by 'real-world' mode. **Warning:** This mode is very lenient and allows technically invalid formats like single-character TLDs, labels starting/ending with hyphens, and some malformed IPv6 literals due to regex limitations.
 */
export type ValidationMode = 'real-world' | 'rfc';

/**
 * Configuration options for the strict email validator.
 */
export interface ValidatorOptions {
  /**
   * If true, performs a DNS MX record lookup on the email's domain
   * to check if it's configured to receive mail.
   * Requires network access. Returns false if MX lookup fails or finds no records.
   * @default false
   */
  checkDomain?: boolean;

  /**
   * Specifies the validation strictness level ('real-world' or 'rfc').
   * 'real-world' (default) is stricter, rejecting unbracketed IPs and single-label domains (like `localhost`).
   * 'rfc' allows more formats according to standards, including those rejected by 'real-world' mode.
   * @default 'real-world'
   */
  validationMode?: ValidationMode;
}

// 'Real-world' regex: Requires domain name with TLD. Rejects quoted local parts and IP literals.
// Also enforces that domain labels start/end with alphanumeric characters.
const realWorldEmailRegex = new RegExp(
  /^([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)@(([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})$/i
);

// --- RFC MODE REGEX COMPONENTS ---
// Local part: dot-atom or quoted string
const rfcUnquotedLocal = /[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*/;
// Simpler quoted local part: allow any character except unescaped ", or escaped chars
const rfcQuotedLocal = /"([^"\\]|\\.)*"/;

// Domain part: domain, IPv4, IPv6 (basic)
const rfcDomain = /([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+/; // allows single-label, hyphens anywhere
const rfcIPv4 = /\[(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\]/;
const rfcIPv6 = /\[IPv6:[a-fA-F0-9:]+\]/; // basic structure only

// Combine for RFC mode
const rfcSyntaxRegex = new RegExp(
  `^(${rfcUnquotedLocal.source}|${rfcQuotedLocal.source})@(${rfcDomain.source}|${rfcIPv4.source}|${rfcIPv6.source})$`
);

/**
 * Validates an email address string with configurable syntax rules (real-world vs. RFC)
 * and an optional DNS MX record check for the domain.
 *
 * @param email - The email address string to validate.
 * @param {ValidatorOptions} [options] - Optional configuration object.
 * @param {boolean} [options.checkDomain=false] - Whether to perform DNS MX record lookup.
 * @param {ValidationMode} [options.validationMode='real-world'] - Syntax validation mode.
 * @returns {Promise<boolean>} A Promise resolving to `true` if the email is valid according to the options, otherwise `false`.
 * @throws {TypeError} If the input `email` is not a string.
 */
export async function validateEmailStrict(
  email: string,
  options?: ValidatorOptions,
): Promise<boolean> {
  if (typeof email !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) {
    return false;
  }

  // Determine validation mode and select regex
  const validationMode = options?.validationMode ?? 'real-world';
  const selectedRegex = validationMode === 'rfc' ? rfcSyntaxRegex : realWorldEmailRegex;

  // 1. Syntax Check
  if (!selectedRegex.test(trimmedEmail)) {
    return false;
  }

  // --- POST-REGEX CHECKS FOR RFC MODE ---
  if (validationMode === 'rfc') {
    // Extract domain part
    const domainPart = trimmedEmail.split('@')[1];
    if (domainPart) {
      // If domain is not an IP literal, optionally check TLD length and label rules
      if (!domainPart.startsWith('[')) {
        const labels = domainPart.split('.');
        // TLD length check (warn: RFC allows 1-char, but most real TLDs are >=2)
        const tld = labels[labels.length - 1];
        if (tld.length === 0) return false;
        // Optionally, check for empty labels (double dots)
        if (labels.some(l => l.length === 0)) return false;
      }
    }
  }

  // 2. Domain Check (Optional)
  const checkDomain = options?.checkDomain ?? false;
  if (!checkDomain) {
    return true; // Syntax is valid, no domain check requested
  }

  const domain = trimmedEmail.split('@')[1];
  if (!domain) {
    // Should not happen if regex passed, but defensive check
    return false;
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    // Check if MX records exist and are not empty
    return mxRecords && mxRecords.length > 0;
  } catch (error: unknown) {
    // Handle common DNS errors gracefully

    // Type guard to check if error is an object with a code property
    const nodeError = error as (Error & { code?: string });

    if (
      nodeError?.code === 'ENOTFOUND' ||
      nodeError?.code === 'ENODATA' ||
      nodeError?.code === 'ESERVFAIL' || // Common server failure
      nodeError?.code === 'ETIMEOUT' // Added timeout case
    ) {
      return false;
    }
    // For unexpected errors, log them but still return false
    // console.error(`Unexpected DNS error for ${domain}:`, error);
    return false;
  }
} 