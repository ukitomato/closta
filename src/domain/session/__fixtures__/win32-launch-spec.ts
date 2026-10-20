import { WIN32_TREE_STOP_ARGS, type Win32LaunchSpec } from '../agent-session'

/**
 * Win32 の起動の値の正規の fixture (contracts C-4 の値。X-8)。
 *
 * agents の decoder (BE-010) が通す値と、main の組み立て (BE-011) の結果が一致する値を 1 つにして、
 * build → decode の往復を結ぶ (agents と main は互いを import できないため、共有できるのは domain のここだけ)。
 */
export const WIN32_LAUNCH_SPEC_FIXTURE: Win32LaunchSpec = {
  kind: 'win32',
  pathToClaudeCodeExecutable: 'C:\\Users\\u\\.local\\bin\\claude.exe',
  command: 'C:\\Users\\u\\.local\\bin\\claude.exe',
  cwd: 'C:\\dev\\closta',
  env: { PATH: 'C:\\WINDOWS\\system32', SystemRoot: 'C:\\WINDOWS', windir: 'C:\\WINDOWS' },
  windowsHide: true,
  stop: {
    command: 'C:\\WINDOWS\\System32\\taskkill.exe',
    argsBeforePid: [...WIN32_TREE_STOP_ARGS],
    env: { SystemRoot: 'C:\\WINDOWS', windir: 'C:\\WINDOWS' }
  }
}
