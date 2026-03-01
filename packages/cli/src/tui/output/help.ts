import { t } from '../theme.js'

/**
 * renderHelp — print available shell commands grouped by category.
 */
export function renderHelp(): void {
  const section = (label: string) =>
    '\n  ' + t.dim('─── ') + t.blue(label) + '\n'

  const cmd = (name: string, desc: string) => {
    const pad = ' '.repeat(Math.max(1, 26 - name.length))
    return '  ' + t.white(name) + t.dim(pad + desc) + '\n'
  }

  let out = '\n'

  out += section('governance')
  out += cmd('status',                  'kernel status — RS hash, modules, decisions')
  out += cmd('proposals',               'alias for proposals list')
  out += cmd('proposals list',          'list all proposals')
  out += cmd('proposals show <id>',     'show proposal detail')

  out += section('navigation')
  out += cmd('/command-view  /cv',      'open full-screen dashboard (Ink view)')

  out += section('system')
  out += cmd('help',                    'show this help')
  out += cmd('Ctrl+C',                  'exit')

  out += '\n  ' + t.dim('proposals approve / reject coming in next pass') + '\n'

  process.stdout.write(out)
}
