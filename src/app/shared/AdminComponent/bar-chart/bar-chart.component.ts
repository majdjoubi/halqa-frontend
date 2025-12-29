import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import ApexCharts from 'apexcharts';

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  templateUrl: './bar-chart.component.html',
  styleUrls: ['./bar-chart.component.scss'],
})
export class BarChartComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('barChart', { static: true }) chartEl!: ElementRef<HTMLDivElement>;
  private apex: any | null = null;

  @Input() series: { name: string; data: number[] }[] | null = null;
  @Input() categories: string[] | null = null;
  @Input() title: string | null = null;
  @Input() showDataLabels = false; // default hide numbers on top of bars (matches design)
  // header inputs to show subtitle and main value above chart (like the image)
  @Input() headerSubtitle: string | null = null;
  @Input() headerValue: string | null = null;
  @Input() barColor: string = '#2ECC71';

  private defaultSeries = [
    // weekly sample values (Mon..Sun) to match the example image look
    { name: 'Income', data: [75, 95, 70, 35, 60, 50, 85] },
  ];
  // use clear weekday labels by default
  private defaultCategories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  private buildOptions() {
    return {
      series:
        this.series && this.series.length ? this.series : this.defaultSeries,
      chart: {
        type: 'bar',
        height: 300,
        toolbar: { show: false },
        background: 'transparent',
      },
      plotOptions: {
        bar: {
          dataLabels: { position: 'top' },
          borderRadius: 10,
          columnWidth: '48%',
          endingShape: 'rounded',
        },
      },
      dataLabels: {
        enabled: this.showDataLabels,
        formatter: function (val: any) {
          return val;
        },
        offsetY: -10,
        style: { fontSize: '12px', colors: ['#304758'] },
      },
      xaxis: {
        // Prefer passed categories only when they match the series data length; otherwise fallback to weekdays
        categories: (() => {
          const dataLen =
            (this.series &&
              this.series.length &&
              this.series[0].data &&
              this.series[0].data.length) ||
            (this.defaultSeries[0].data && this.defaultSeries[0].data.length) ||
            this.defaultCategories.length;
          return this.categories && this.categories.length === dataLen
            ? this.categories
            : this.defaultCategories;
        })(),
        position: 'bottom',
        // move labels further down so they are not clipped
        labels: {
          show: true,
          offsetY: 18,
          style: { colors: '#9aa4b2', fontSize: '12px' },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'light',
          type: 'vertical',
          shadeIntensity: 0.3,
          inverseColors: false,
          opacityFrom: 0.95,
          opacityTo: 0.85,
          stops: [0, 100],
        },
        colors: [this.barColor],
      },
      tooltip: { theme: 'light', y: { formatter: (val: any) => `${val}` } },
      responsive: [
        {
          breakpoint: 600,
          options: {
            chart: { height: 180 },
            plotOptions: { bar: { columnWidth: '60%' } },
          },
        },
      ],
      yaxis: { show: false },
      grid: { show: false, padding: { bottom: 26 } },
      title: {
        text: this.title || '',
        floating: !!this.title,
        offsetY: 320,
        align: 'center',
        style: { color: '#444' },
      },
    };
  }

  ngAfterViewInit(): void {
    const options = this.buildOptions();
    this.apex = new ApexCharts(this.chartEl.nativeElement, options);
    this.apex.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.apex) {
      if (changes['series'] && this.series) {
        try {
          this.apex.updateSeries(this.series, true);
        } catch (e) {}
      }
      if (changes['categories'] && this.categories) {
        try {
          this.apex.updateOptions(
            { xaxis: { categories: this.categories } },
            true
          );
        } catch (e) {}
      }
      if (changes['title'] && this.title !== undefined) {
        try {
          this.apex.updateOptions({ title: { text: this.title } }, true);
        } catch (e) {}
      }
    }
  }

  ngOnDestroy(): void {
    if (this.apex) {
      this.apex.destroy();
      this.apex = null;
    }
  }
}
