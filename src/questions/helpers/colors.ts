import chalk from 'chalk';

export function accentColorChoices() {
  return materialColors
    .filter((c) => c.primary_only !== true)
    .map((c) => {
      return chalk.hex(c.hex).bold(c.name);
    });
}

export function primaryColorChoices() {
  return materialColors.map((c) => {
    return chalk.hex(c.hex).bold(c.name);
  });
}

export const materialColors = [
  {
    name: 'red',
    hex: 'f44336',
    primary_only: false,
  },
  {
    name: 'pink',
    hex: 'E91E63',
    primary_only: false,
  },
  {
    name: 'purple',
    hex: '9C27B0',
    primary_only: false,
  },
  {
    name: 'deep purple',
    hex: '673AB7',
    primary_only: false,
  },
  {
    name: 'indigo',
    hex: '3F51B5',
    primary_only: false,
  },
  {
    name: 'blue',
    hex: '2196F3',
    primary_only: false,
  },
  {
    name: 'light blue',
    hex: '03A9F4',
    primary_only: false,
  },
  {
    name: 'cyan',
    hex: '00BCD4',
    primary_only: false,
  },
  {
    name: 'teal',
    hex: '009688',
    primary_only: false,
  },
  {
    name: 'green',
    hex: '4CAF50',
    primary_only: false,
  },
  {
    name: 'light green',
    hex: '8BC34A',
    primary_only: false,
  },
  {
    name: 'lime',
    hex: 'CDDC39',
    primary_only: false,
  },
  {
    name: 'yellow',
    hex: 'FFEB3B',
    primary_only: false,
  },
  {
    name: 'amber',
    hex: 'FFC107',
    primary_only: false,
  },
  {
    name: 'orange',
    hex: 'FF9800',
    primary_only: false,
  },
  {
    name: 'deep orange',
    hex: 'FF5722',
    primary_only: false,
  },
  {
    name: 'brown',
    hex: '795548',
    primary_only: true,
  },
  {
    name: 'grey',
    hex: '9E9E9E',
    primary_only: true,
  },
  {
    name: 'blue grey',
    hex: '607D8B',
    primary_only: true,
  },
  {
    name: 'white',
    hex: 'FFFFFF',
    primary_only: true,
  },
];
