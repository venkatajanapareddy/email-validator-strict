# email-validator-strict

[![npm version](https://badge.fury.io/js/email-validator-strict.svg)](https://badge.fury.io/js/email-validator-strict)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- [![Build Status](https://github.com/venkatajanapareddy/email-validator-strict/actions/workflows/ci.yml/badge.svg)](https://github.com/venkatajanapareddy/email-validator-strict/actions) -->

A TypeScript library for strict email address validation, including optional DNS MX record checks and configurable syntax modes.

---

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Basic Usage (Real-world Mode)](#basic-usage-real-world-mode)
- [Detailed Usage & Options](#detailed-usage--options)
- [Edge Case Examples](#edge-case-examples)
- [TypeScript Usage](#typescript-usage)
- [Performance & Security Notes](#performance--security-notes)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [References](#references)

---

## Features

*   **Configurable Syntax Validation:** Choose between:
    *   `'real-world'` (Default): Stricter regex common for practical applications. Allows standard characters and underscores. Rejects quoted local parts, single-label domains, and all IP address formats.
    *   `'rfc'`: More permissive regex closer to RFC specifications. **Warning:** Allows formats rejected by `real-world` mode *and* some technically invalid formats like single-character TLDs, labels starting/ending with hyphens, and certain malformed IPv6 literals due to regex limitations necessary to avoid build errors. Use with caution.
*   **Optional DNS MX Check:** Can verify if the email's domain has valid MX (Mail Exchanger) records, indicating it's configured to receive emails.
*   **Asynchronous:** Returns a Promise, suitable for modern JavaScript applications.
*   **TypeScript Native:** Written entirely in TypeScript with included type definitions.
*   **Zero Runtime Dependencies:** Uses the built-in `node:dns/promises` module for DNS lookups.
*   **Well-Tested:** Comprehensive test suite using Vitest with mocking for network calls.
*   **MIT Licensed:** Free to use and modify.

## Installation

```bash
npm install email-validator-strict
# or
yarn add email-validator-strict
# or
pnpm add email-validator-strict
```

## Basic Usage (Real-world Mode)

The default mode (`'real-world'`) performs strict syntax validation common in many applications.

```typescript
import { validateEmailStrict } from 'email-validator-strict';

async function checkEmailSyntax(email: string) {
  // Uses default 'real-world' syntax mode
  const isValid = await validateEmailStrict(email);
  if (isValid) {
    console.log(`[Real World Mode] ${email} has valid syntax.`);
  } else {
    console.log(`[Real World Mode] ${email} has invalid syntax.`);
  }
}

checkEmailSyntax('test@example.com'); // => Valid
checkEmailSyntax('test@localhost');   // => Invalid (in real-world mode)
checkEmailSyntax('invalid-email');   // => Invalid
```

## Detailed Usage & Options

The library exports one primary function:

```typescript
import { validateEmailStrict, ValidatorOptions, ValidationMode } from 'email-validator-strict';

validateEmailStrict(email: string, options?: ValidatorOptions): Promise<boolean>;
```

And the relevant types:

```typescript
/**
 * Specifies the validation strictness level.
 * - 'real-world': (Default) Stricter validation rejecting formats like `user@localhost`, `user@ip_address`, quoted local parts, and IP literals. Allows underscores.
 * - 'rfc': More permissive validation allowing formats rejected by 'real-world' mode. **Warning:** Highly lenient, see main README section.
 */
export type ValidationMode = 'real-world' | 'rfc';

export interface ValidatorOptions {
  /**
   * If true, performs a DNS MX record lookup...
   * @default false
   */
  checkDomain?: boolean;

  /**
   * Specifies the validation strictness level ('real-world' or 'rfc').
   * @default 'real-world'
   */
  validationMode?: ValidationMode;
}
```

### Syntax Validation Modes (`validationMode`)

You can control the strictness of the syntax check:

*   `validationMode: 'real-world'` (Default):
    *   Requires standard domain format (e.g., `domain.tld`).
    *   Allows letters, numbers, `.` `_` `+` `-` in the local part.
    *   Rejects quoted local parts (e.g., `"user name"@example.com`).
    *   Rejects single-label domains (e.g., `user@localhost`).
    *   Rejects bare IP addresses (e.g., `user@192.168.0.1`).
    *   Rejects bracketed IP addresses (e.g., `user@[192.168.0.1]`, `user@[IPv6:...]`).
    *   Generally preferred for most web application forms.
*   `validationMode: 'rfc'`:
    *   Allows formats rejected by `real-world` mode, including quoted local parts, single-label domains, bare IPs, and bracketed IP literals.
    *   **Warning:** Due to limitations avoiding build errors, this mode is highly permissive and **will also validate** some technically invalid formats, such as:
        *   Single-character TLDs (`user@example.c`)
        *   Domain labels starting or ending with hyphens (`user@-example.com`)
        *   Some malformed IPv6 literals (`user@[IPv6:::1]`)
    *   Use this mode with caution, understanding its limitations.

```typescript
import { validateEmailStrict } from 'email-validator-strict';

// Real-world mode (default)
console.log(await validateEmailStrict('test_user@example.com')); // => true
console.log(await validateEmailStrict('"user name"@example.com')); // => false
console.log(await validateEmailStrict('test@localhost')); // => false
console.log(await validateEmailStrict('test@1.2.3.4')); // => false
console.log(await validateEmailStrict('test@[1.2.3.4]')); // => false
console.log(await validateEmailStrict('test@[IPv6:1::2]')); // => false

// RFC mode
const rfcOptions = { validationMode: 'rfc' as const };
console.log(await validateEmailStrict('test_user@example.com', rfcOptions)); // => true
console.log(await validateEmailStrict('"user name"@example.com', rfcOptions)); // => true
console.log(await validateEmailStrict('test@localhost', rfcOptions)); // => true
console.log(await validateEmailStrict('test@1.2.3.4', rfcOptions)); // => true
console.log(await validateEmailStrict('test@[1.2.3.4]', rfcOptions)); // => true
console.log(await validateEmailStrict('test@[IPv6:1::2]', rfcOptions)); // => true
console.log(await validateEmailStrict('test@example.c', rfcOptions)); // => true (Warning: lenient)
console.log(await validateEmailStrict('test@-example.com', rfcOptions)); // => true (Warning: lenient)
console.log(await validateEmailStrict('test@[IPv6:::1]', rfcOptions)); // => true (Warning: lenient)
```

## Edge Case Examples

| Email Address                | Real-world Mode | RFC Mode |
|------------------------------|:--------------:|:--------:|
| test@example.com             |      ✅        |    ✅    |
| test@localhost               |      ❌        |    ✅    |
| "user name"@example.com      |      ❌        |    ✅    |
| test@192.168.1.1             |      ❌        |    ✅    |
| test@[192.168.1.1]           |      ❌        |    ✅    |
| test@[IPv6:2001:db8::1]      |      ❌        |    ✅    |
| test@example.c               |      ❌        |    ✅*   |
| test@-example.com            |      ❌        |    ✅*   |
| test@[IPv6:::1]              |      ❌        |    ✅*   |
| test..user@example.com       |      ❌        |    ❌    |
| test@.example.com            |      ❌        |    ❌    |
| test@                        |      ❌        |    ❌    |
| @example.com                 |      ❌        |    ❌    |

*✅* = Valid in RFC mode, but not technically correct per the RFC; see [limitations](#syntax-validation-modes-validationmode).

## TypeScript Usage

You can use the exported types for full type safety:

```typescript
import { validateEmailStrict, ValidatorOptions, ValidationMode } from 'email-validator-strict';

const options: ValidatorOptions = {
  checkDomain: true,
  validationMode: 'real-world',
};

const isValid: boolean = await validateEmailStrict('user@example.com', options);
```

## Performance & Security Notes

- **DNS Checks:** If you enable `checkDomain`, the library performs a DNS MX lookup using Node.js's built-in DNS module. This requires network access and may be slow or fail if the network is unavailable or the DNS server is slow/unresponsive.
- **Privacy:** No email addresses are sent to any third-party servers; DNS lookups are performed locally using your system's resolver.
- **Regex Limitations:** Regex-based validation cannot fully guarantee RFC compliance. For the strictest needs, consider using a full parser or additional validation steps.

## Development

*   **Install Dependencies:** `npm install`
*   **Build:** `npm run build` (generates ESM and CJS bundles in `dist/`)
*   **Test:** `npm test` (runs tests once)
*   **Test Watch Mode:** `npm run dev`
*   **Coverage:** `npm run test:coverage`
*   **Lint:** `npm run lint`
*   **Format:** `npm run format`

## Contributing

Contributions are welcome! Please open issues or pull requests.

## License

[MIT](./LICENSE)

## References

- [RFC 5322: Internet Message Format](https://datatracker.ietf.org/doc/html/rfc5322)
- [MDN: Email address syntax](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email#validation)
- [Wikipedia: Email address](https://en.wikipedia.org/wiki/Email_address)

---

> This project follows [Semantic Versioning](https://semver.org/).