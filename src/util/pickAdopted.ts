import { PolicyBuilderElement } from '~/src/types';

function adoptedFilter(item: { adopted?: boolean }) {
  return item.adopted === true;
}

export default function pickAdopted<T extends PolicyBuilderElement>(
  collection: T[] | undefined
): T[] {
  return collection ? collection.filter(adoptedFilter) : [];
}
