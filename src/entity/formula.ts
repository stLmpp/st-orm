import { entityStore } from '../store/entity-store.ts';

export type FormulaFn = (tableAlias: string, columnAlias: string) => string;

export function Formula(formula: FormulaFn): PropertyDecorator {
  return (target, propertyKey) => {
    entityStore.upsertFormula(target.constructor, propertyKey.toString(), formula);
  };
}

// TODO do formula
