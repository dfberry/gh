// test-gh-sdk.js
// This script demonstrates importing the built gh SDK from dist and calling a sample function.

const gh = require('./dist');

// Example usage: print available keys or exported members
console.log('gh SDK exports:', Object.keys(gh));

// If the SDK exports a function, you can call it here for demonstration
// Example: if gh has a function named 'hello', uncomment below
// console.log('gh.hello():', gh.hello());
