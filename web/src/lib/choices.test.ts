import { describe, expect, it } from 'vitest';
import { toggleChoice } from './choices.ts';

describe('toggleChoice', () => {
  it('adds and removes ordinary options', () => {
    expect(toggleChoice([], 'bar')).toEqual(['bar']);
    expect(toggleChoice(['bar', 'step'], 'bar')).toEqual(['step']);
  });

  it('clears the exclusive option when something else is picked', () => {
    expect(toggleChoice(['none'], 'bar', 'none')).toEqual(['bar']);
    expect(toggleChoice(['none'], 'step', 'none')).toEqual(['step']);
  });

  it('clears everything else when the exclusive option is picked', () => {
    expect(toggleChoice(['bar', 'step'], 'none', 'none')).toEqual(['none']);
  });

  it('lets the exclusive option be switched off', () => {
    expect(toggleChoice(['none'], 'none', 'none')).toEqual([]);
  });

  it('keeps other selections intact alongside each other', () => {
    expect(toggleChoice(['bar'], 'step', 'none')).toEqual(['bar', 'step']);
  });

  it('behaves as a plain multi-select with no exclusive option', () => {
    expect(toggleChoice(['none'], 'bar')).toEqual(['none', 'bar']);
  });
});
