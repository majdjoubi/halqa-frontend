import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type PercentColor = 'blue' | 'yellow' | 'green' | 'red' | 'gray';

export interface DashCard {
  title: string;
  value: string | number;
  percent?: string; // e.g. "59.3%"
  isUp?: boolean; // true => upward trend, false => downward
  percentBg?: PercentColor; // controls badge color
  extraText?: string; // small line before extraValue
  extraValue?: string | number; // highlighted small value in the extra line
}

@Component({
  selector: 'app-dash-board-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dash-board-cards.component.html',
  styleUrls: ['./dash-board-cards.component.scss'],
})
export class DashBoardCardsComponent {
  // Accept an array of card data from parent components. If empty, show sample data.
  @Input() cards: DashCard[] = [];

  // Sample fallback data (matches the attached image closely). You can override by passing `cards` input.
  defaultCards: DashCard[] = [
    {
      title: 'Total Page Views',
      value: '4,42,236',
      percent: '59.3%',
      isUp: true,
      percentBg: 'blue',
      extraText: 'You made an extra',
      extraValue: '35,000',
    },
    {
      title: 'Total Users',
      value: '78,250',
      percent: '70.5%',
      isUp: true,
      percentBg: 'blue',
      extraText: 'You made an extra',
      extraValue: '8,900',
    },
    {
      title: 'Total Order',
      value: '18,800',
      percent: '27.4%',
      isUp: false,
      percentBg: 'yellow',
      extraText: 'You made an extra',
      extraValue: '1,943',
    },
    {
      title: 'Total Sales',
      value: '35,078',
      percent: '27.4%',
      isUp: false,
      percentBg: 'yellow',
      extraText: 'You made an extra',
      extraValue: '20,395',
    },
  ];

  get cardsToShow(): DashCard[] {
    return Array.isArray(this.cards) && this.cards.length
      ? this.cards
      : this.defaultCards;
  }

  // lightweight formatter to keep numbers with commas if passed as number
  formatValue(v: string | number | undefined) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return v.toLocaleString();
    return v;
  }
}
