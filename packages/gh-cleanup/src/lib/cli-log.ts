export function startSection(title: string): void {
  console.log('');
  console.log('------------------------------------------------------------');
  console.log(`START: ${title}`);
  console.log('------------------------------------------------------------');
}

export function endSection(title: string, status: string = 'done'): void {
  console.log('------------------------------------------------------------');
  console.log(`END:   ${title} — ${status}`);
  console.log('------------------------------------------------------------');
  console.log('');
}

export default { startSection, endSection };
