import { Notice } from 'obsidian';

export const deploy = async (url: string) => {
  if (!url) {
    new Notice('Please set `Deploy hook URL`');
    return;
  }
  const res = await fetch(url, {
    method: 'POST',
  });
  console.log(await res.json());
  new Notice('Deployed');
};
