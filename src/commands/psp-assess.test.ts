import { calculateInputGaps } from '~/src/commands/psp-assess';

test('#calculateInputGaps should return gaps as ref and title', () => {
  const gaps = calculateInputGaps({
    hasHIPAATrainingGap: true,
    hasPenTestGap: true,
    date: new Date(),
    isHIPAACoveredEntityText: 'is',
    isHIPAABusinessAssociateText: 'is not',
  });

  gaps.sort((v1, v2) => {
    return v1.ref.localeCompare(v2.ref);
  });

  expect(gaps).toEqual([
    {
      ref: 'HIPAA Training',
      title: '(see above)',
    },
    {
      ref: 'Pen Test',
      title: '(see above)',
    },
  ]);
});
