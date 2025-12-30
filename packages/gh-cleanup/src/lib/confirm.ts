import * as readline from 'node:readline';

export async function requireTypedConfirmation(question = 'Type YES to confirm:'): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise<string>((resolve) => rl.question(`${question} `, (a: string) => { rl.close(); resolve(a); }));
  return String(ans).trim().toLowerCase() === 'yes';
}
