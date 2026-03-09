// Standard protocol-level capability definitions
// These are auto-served by the API without needing TOML definitions or blob store entries.
//
// URN strings use the fully expanded canonical form (not shorthand like 'cap:')
// to work with any version of the capdag package.

// CAP_IDENTITY: the categorical identity morphism — MANDATORY in every capset
// Canonical form of 'cap:' after wildcard expansion
const IDENTITY_DEFINITION = {
  urn: 'cap:in=media:;out=media:',
  command: 'identity',
  title: 'Identity',
  cap_description: 'The categorical identity morphism. Echoes input as output unchanged. Mandatory in every capability set.',
  args: [],
  output: {
    media_urn: 'media:',
    output_description: 'The input data, unchanged'
  }
};

// CAP_DISCARD: the terminal morphism — standard, NOT mandatory
const DISCARD_DEFINITION = {
  urn: 'cap:in=media:;out=media:void',
  command: 'discard',
  title: 'Discard',
  cap_description: 'The terminal morphism. Accepts any input and produces void output. Standard but not mandatory.',
  args: [],
  output: {
    media_urn: 'media:void',
    output_description: 'Void (no output)'
  }
};

// Map of canonical URN string to definition for quick lookup
const STANDARD_CAPS = new Map();
STANDARD_CAPS.set(IDENTITY_DEFINITION.urn, IDENTITY_DEFINITION);
STANDARD_CAPS.set(DISCARD_DEFINITION.urn, DISCARD_DEFINITION);

function getStandardCaps() {
  return [IDENTITY_DEFINITION, DISCARD_DEFINITION];
}

function getStandardCap(normalizedUrn) {
  return STANDARD_CAPS.get(normalizedUrn) || null;
}

module.exports = { getStandardCaps, getStandardCap, IDENTITY_DEFINITION, DISCARD_DEFINITION };
