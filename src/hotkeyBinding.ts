import type { UiohookKeyboardEvent, UiohookKey } from 'uiohook-napi';

type Modifier = 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey';
type Keys = typeof UiohookKey;

export class HotkeyBinding {
  private readonly down = new Set<number>();
  private readonly key: number;
  private readonly modifiers = new Set<Modifier>();
  private readonly releases = new Set<number>();

  constructor(hotkey: string, keys: Keys, private readonly press: () => void, private readonly release: () => void) {
    const parts = hotkey.toLowerCase().split('+');
    // A trailing plus denotes the plus key, e.g. ctrl++.
    let name = parts.pop()!;
    if (!name && parts[parts.length - 1] === '') { parts.pop(); name = '+'; }
    const modifiers: Record<string, [Modifier, number, number]> = {
      win: ['metaKey', keys.Meta, keys.MetaRight], meta: ['metaKey', keys.Meta, keys.MetaRight],
      ctrl: ['ctrlKey', keys.Ctrl, keys.CtrlRight], alt: ['altKey', keys.Alt, keys.AltRight],
      shift: ['shiftKey', keys.Shift, keys.ShiftRight]
    };
    for (const part of parts) {
      const modifier = modifiers[part];
      if (!modifier) throw new Error(`Invalid hotkey: ${hotkey}`);
      this.modifiers.add(modifier[0]);
      this.releases.add(modifier[1]);
      this.releases.add(modifier[2]);
    }
    const punctuation: Record<string, string> = {
      '/': 'Slash', '?': 'Slash', '=': 'Equal', '+': 'Equal', '-': 'Minus', '_': 'Minus',
      '[': 'BracketLeft', '{': 'BracketLeft', ']': 'BracketRight', '}': 'BracketRight',
      '\\': 'Backslash', '|': 'Backslash', ';': 'Semicolon', ':': 'Semicolon',
      "'": 'Quote', '"': 'Quote', ',': 'Comma', '<': 'Comma', '.': 'Period', '>': 'Period',
      '`': 'Backquote', '~': 'Backquote', '!': '1', '@': '2', '#': '3', '$': '4',
      '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
    };
    if ('?+_{}|:"<>~!@#$%^&*()'.includes(name) && name) {
      this.modifiers.add('shiftKey');
      this.releases.add(keys.Shift);
      this.releases.add(keys.ShiftRight);
    }
    const keyName = punctuation[name] ?? Object.keys(keys).find(key => key.toLowerCase() === name);
    const keycode = keyName ? keys[keyName as keyof Keys] : undefined;
    if (!this.modifiers.size || keycode === undefined) throw new Error(`Invalid hotkey: ${hotkey}`);
    this.key = keycode;
    this.releases.add(keycode);
  }

  keydown = (event: UiohookKeyboardEvent): void => {
    const repeated = this.down.has(event.keycode);
    this.down.add(event.keycode);
    if (repeated || event.keycode !== this.key) return;
    const modifiers: Modifier[] = ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'];
    if (modifiers.every(modifier => !!event[modifier] === this.modifiers.has(modifier))) this.press();
  };

  keyup = (event: UiohookKeyboardEvent): void => {
    this.down.delete(event.keycode);
    if (this.releases.has(event.keycode)) this.release();
  };
}
