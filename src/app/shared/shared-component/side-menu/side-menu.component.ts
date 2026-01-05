import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ElementRef,
  Renderer2,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './side-menu.component.html',
  styleUrls: ['./side-menu.component.scss'],
})
export class SideMenuComponent implements AfterViewInit, OnDestroy {
  // Controls
  private _open = false;

  @Input()
  set open(value: boolean) {
    // Use the internal setter to avoid emitting openChange when value didn't change
    this.setOpen(!!value);
  }
  get open(): boolean {
    return this._open;
  }

  // position: left (default) or right
  @Input() position: 'left' | 'right' = 'left';

  // width of the menu (can be px, %, rem, etc.)
  @Input() width = '420px';

  // whether clicking backdrop / Esc closes the menu
  @Input() closable = true;

  // transition duration for open/close (e.g. '320ms')
  @Input() transition = '320ms';

  // backdrop opacity (0..1)
  @Input() backdropOpacity = 0.45;

  // menu background color
  @Input() backgroundColor = '#ffffff';

  // top offset - used to place the menu under navbar (e.g. '64px')
  @Input() topOffset: string | null = null;

  // if provided, selector of element to attach under (e.g. '.navbar')
  @Input() attachToSelector: string | null = null;

  // two-way friendly output
  @Output() openChange = new EventEmitter<boolean>();
  // emits when menu closes
  @Output() closed = new EventEmitter<void>();
  constructor(
    private _el: ElementRef<HTMLElement>,
    private _renderer: Renderer2
  ) {}

  toggle() {
    this.setOpen(!this._open);
  }

  openMenu() {
    this.setOpen(true);
  }

  closeMenu() {
    this.setOpen(false);
  }

  private setOpen(value: boolean) {
    const prev = this._open;
    this._open = !!value;
    // emit change only if value actually changed
    if (prev !== this._open) {
      this.openChange.emit(this._open);
      if (!this._open) this.closed.emit();
    }
  }

  // move host to body to avoid parent stacking contexts covering the backdrop
  ngAfterViewInit(): void {
    try {
      const host = this._el.nativeElement;
      if (host && host.parentElement !== document.body) {
        this._renderer.appendChild(document.body, host);
      }
      // apply top offset if requested
      if (this.topOffset) {
        this._renderer.setStyle(host, '--side-menu-top', this.topOffset);
        this._renderer.setStyle(
          host,
          'height',
          `calc(100% - ${this.topOffset})`
        );
      } else if (this.attachToSelector) {
        const el = document.querySelector(this.attachToSelector);
        if (el) {
          const r = (el as HTMLElement).getBoundingClientRect();
          const top = `${Math.round(r.height)}px`;
          this._renderer.setStyle(host, '--side-menu-top', top);
          this._renderer.setStyle(host, 'height', `calc(100% - ${top})`);
        }
      }
    } catch (e) {
      // ignore in environments without document
    }
  }

  ngOnDestroy(): void {
    try {
      const host = this._el.nativeElement;
      if (host && host.parentElement === document.body) {
        this._renderer.removeChild(document.body, host);
      }
    } catch (e) {
      // ignore
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this._open && this.closable) this.closeMenu();
  }

  onBackdropClick() {
    if (this.closable) this.closeMenu();
  }

  // Automatically close the side menu when switching to small/mobile view
  @HostListener('window:resize')
  onWindowResize(): void {
    try {
      const isMobile =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 768px)').matches;
      if (isMobile && this._open && this.closable) {
        this.closeMenu();
      }
    } catch (e) {
      // ignore
    }
  }
}
