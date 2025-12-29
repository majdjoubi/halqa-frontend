import {
  Component,
  ElementRef,
  AfterViewInit,
  ViewChild,
  OnDestroy,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import ApexCharts from 'apexcharts';

@Component({
  selector: 'app-spline-chart',
  standalone: true,
  templateUrl: './spline-chart.component.html',
  styleUrls: ['./spline-chart.component.scss'],
})
export class SplineChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  chartEl!: ElementRef<HTMLDivElement>;
  private apex: any | null = null;
  /** Inputs: parent components can pass series and categories */
  @Input() series: { name: string; data: number[] }[] | null = null;
  @Input() categories: string[] | null = null;

  private options: any = {
    colors: ['#27AE60', '#3498DB', '#9B59B6', '#E74C3C', '#F39C12', '#1ABC9C'], // High contrast color palette
    series: [
      /* will be replaced by input if provided */
    ],
    chart: {
      height: 360,
      type: 'area',
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
      },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: [3, 2] },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.5,
        gradientToColors: ['#D5F5E3', '#D6EAF8', '#E8DAEF', '#FADBD8', '#FCF3CF', '#D1F2EB'],
        inverseColors: false,
        opacityFrom: 0.7,
        opacityTo: 0.1,
        stops: [0, 85, 100],
      },
    },
    markers: { size: 6, hover: { size: 8 } },
    xaxis: {
      type: 'category',
      categories: [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#9aa4b2', fontSize: '12px' } },
    },
    yaxis: {
      min: 0,
      max: 160,
      tickAmount: 5,
    },
    grid: {
      borderColor: '#eef1f6',
      strokeDashArray: 0,
      padding: { left: 10, right: 10 },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: 'light',
      style: { fontSize: '13px' },
      y: {
        formatter: function (val: any) {
          return val;
        },
      },
    },
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'center',
      markers: { width: 8, height: 8, radius: 8 },
    },
    annotations: {
      xaxis: [
        { x: 'Jun', strokeDashArray: 4, borderColor: '#111827', opacity: 0.6 },
      ],
      points: [
        {
          x: 'Jun',
          y: 105,
          marker: {
            size: 8,
            fillColor: '#60A5FA',
            strokeColor: '#fff',
            radius: 2,
          },
        },
        {
          x: 'Jun',
          y: 36,
          marker: {
            size: 6,
            fillColor: '#0B5FFF',
            strokeColor: '#fff',
            radius: 2,
          },
        },
      ],
    },
  };

  // default fallback data (used when parent doesn't pass inputs)
  private defaultSeries = [
    {
      name: 'Page views',
      data: [78, 60, 150, 38, 90, 105, 95, 110, 80, 115, 95, 40],
    },
    {
      name: 'Sessions',
      data: [110, 60, 40, 35, 60, 36, 26, 45, 65, 55, 50, 35],
    },
  ];
  private defaultCategories = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  ngOnChanges(changes: SimpleChanges): void {
    // if chart already rendered, update it when inputs change
    if (this.apex) {
      if (changes['series'] && this.series) {
        // update series data
        try {
          this.apex.updateSeries(this.series, true);
        } catch (e) {
          /* ignore */
        }
      }
      if (changes['categories'] && this.categories) {
        try {
          this.apex.updateOptions(
            { xaxis: { categories: this.categories } },
            true
          );
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  ngAfterViewInit(): void {
    // create chart
    // apply inputs or defaults
    this.options.series =
      Array.isArray(this.series) && this.series.length
        ? this.series
        : this.defaultSeries;
    this.options.xaxis.categories =
      Array.isArray(this.categories) && this.categories.length
        ? this.categories
        : this.defaultCategories;

    this.apex = new ApexCharts(this.chartEl.nativeElement, this.options);
    this.apex.render();
  }

  ngOnDestroy(): void {
    if (this.apex) {
      this.apex.destroy();
      this.apex = null;
    }
  }

  public generateData(
    baseval: number,
    count: number,
    yrange: { min: number; max: number }
  ) {
    let i = 0;
    const series: any[] = [];
    while (i < count) {
      const x = Math.floor(Math.random() * (750 - 1 + 1)) + 1;
      const y =
        Math.floor(Math.random() * (yrange.max - yrange.min + 1)) + yrange.min;
      const z = Math.floor(Math.random() * (75 - 15 + 1)) + 15;

      series.push([x, y, z]);
      baseval += 86400000;
      i++;
    }
    return series;
  }
}
