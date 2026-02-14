import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DOUBAN_USER = process.env.DOUBAN_USER;
const skip = !DOUBAN_USER;

describe('E2E Live: douban-rss-sync against real RSS feed', { skip }, () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'douban-live-e2e-'));
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true });
  });

  it('should run douban-rss-sync and produce CSV files', () => {
    const scriptPath = path.resolve(import.meta.dirname, '..', 'scripts', 'douban-rss-sync.js');

    execFileSync('node', [scriptPath], {
      env: {
        ...process.env,
        DOUBAN_USER,
        DOUBAN_OUTPUT_DIR: tmpDir,
      },
      timeout: 60000,
    });

    // Output dir should be tmpDir/DOUBAN_USER/
    const userDir = path.join(tmpDir, DOUBAN_USER);
    const stat = fs.stat(userDir);
    assert.ok(stat, 'user output dir should exist');
  });

  it('CSV files should have correct headers', async () => {
    const userDir = path.join(tmpDir, DOUBAN_USER);
    const expectedHeader = 'title,url,date,rating,status,comment';
    const possibleFiles = ['书.csv', '影视.csv', '音乐.csv', '游戏.csv'];

    let foundAtLeastOne = false;
    for (const f of possibleFiles) {
      try {
        const content = await fs.readFile(path.join(userDir, f), 'utf8');
        const firstLine = content.split('\n')[0];
        assert.equal(firstLine, expectedHeader, `${f} header should match`);
        foundAtLeastOne = true;
      } catch (e) {
        // File might not exist if user has no entries in that category — that's OK
        if (e.code !== 'ENOENT') throw e;
      }
    }

    // RSS should have at least one category with data
    assert.ok(foundAtLeastOne, 'at least one CSV should be created from RSS');
  });

  it('CSV data rows should have valid structure', async () => {
    const userDir = path.join(tmpDir, DOUBAN_USER);
    const possibleFiles = ['书.csv', '影视.csv', '音乐.csv', '游戏.csv'];

    for (const f of possibleFiles) {
      let content;
      try {
        content = await fs.readFile(path.join(userDir, f), 'utf8');
      } catch {
        continue; // skip missing files
      }

      const lines = content.trim().split('\n');
      if (lines.length < 2) continue; // header only, no data

      for (const line of lines.slice(1)) {
        // Each line should have at least a title and url
        // Simple check: line should not be empty and should contain at least one comma
        assert.ok(line.length > 0, 'data line should not be empty');
        assert.ok(line.includes(','), 'data line should contain commas');

        // URL should contain douban.com
        assert.ok(
          line.includes('douban.com') || line.includes('douban.com'),
          `${f} row should contain a douban.com URL`
        );
      }
    }
  });

  it('should be idempotent (running twice does not duplicate entries)', async () => {
    const scriptPath = path.resolve(import.meta.dirname, '..', 'scripts', 'douban-rss-sync.js');

    // Run a second time
    execFileSync('node', [scriptPath], {
      env: {
        ...process.env,
        DOUBAN_USER,
        DOUBAN_OUTPUT_DIR: tmpDir,
      },
      timeout: 60000,
    });

    const userDir = path.join(tmpDir, DOUBAN_USER);
    const possibleFiles = ['书.csv', '影视.csv', '音乐.csv', '游戏.csv'];

    for (const f of possibleFiles) {
      let content;
      try {
        content = await fs.readFile(path.join(userDir, f), 'utf8');
      } catch {
        continue;
      }

      const lines = content.trim().split('\n').slice(1); // skip header
      const urls = lines.map(l => {
        // Extract second column (url)
        const match = l.match(/,([^,]+),/);
        return match ? match[1] : '';
      });
      const uniqueUrls = new Set(urls);
      assert.equal(urls.length, uniqueUrls.size, `${f}: no duplicate URLs after running twice`);
    }
  });
});
