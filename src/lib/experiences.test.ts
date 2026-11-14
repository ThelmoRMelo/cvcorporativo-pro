import { describe, it, expect } from 'vitest';
import { mergeActivities, parseMonth, formatPeriod, newExperience, sortExperiences } from './experiences';
describe('experiences', () => {
  it('não repete atribuições ao juntar sugestões', () => {
    expect(mergeActivities('Controle de estoque', ['controle de estoque.', 'Inventário', 'Inventário'])).toBe('Controle de estoque\nInventário');
  });
  it('converte Janeiro/2022', () => {
    expect(parseMonth('Janeiro')).toBe('01');
    expect(formatPeriod({ ...newExperience(), startMonth: '01', startYear: '2022', current: true })).toBe('Jan/2022 a Atual');
  });
  it('emprego atual fica no topo', () => {
    const a = { ...newExperience(), company: 'A', startYear: '2023' }, b = { ...newExperience(), company: 'B', startYear: '2010', current: true };
    expect(sortExperiences([a, b])[0].company).toBe('B');
  });
});
