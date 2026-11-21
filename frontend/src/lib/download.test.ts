import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './download';

describe('saveBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clicks a temporary link carrying the object URL and filename', () => {
    const createObjectURL = vi.fn(() => 'blob:examguard');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    saveBlob(new Blob(['report']), 'examguard-report.pdf');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('examguard-report.pdf');
    expect(anchor.href).toBe('blob:examguard');
    expect(anchor.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:examguard');
  });
});
