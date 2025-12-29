import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SideMenuComponent } from '../../shared-component/side-menu/side-menu.component';

@Component({
  selector: 'app-show-users',
  standalone: true,
  imports: [CommonModule, FormsModule, SideMenuComponent],
  templateUrl: './show-users.component.html',
  styleUrls: ['./show-users.component.scss'],
})
export class ShowUsersComponent implements OnChanges, OnDestroy {
  // Input data: an array of user/teacher objects
  @Input() users: any[] = [];
  // Optional custom mapper to normalize an incoming item to the shape the component expects.
  // Signature: (item) => NormalizedUser
  @Input() mapFn?: (item: any) => any;
  // Optional title to display in the header
  @Input() title: string = 'Pending Teachers';
  // whether to show count next to title
  @Input() showCount = true;

  // dynamic action buttons configuration. Example:
  // [{ label: 'Approve', bg: '#0b8043', action: 'approve' }, { label: 'Reject', bg: '#c30000', action: 'reject' }]
  @Input() actionButtons: Array<{
    label: string;
    bg?: string;
    action?: string;
  }> | null = null;

  // emit when a dynamic action is clicked. Payload: { action: string, user: any }
  @Output() action = new EventEmitter<{ action: string; user: any }>();

  // simple search model and filtered list
  searchText = '';
  // debounce timer id for search
  private searchTimer: any = null;
  // status filter toggles
  // support dynamic status options provided by parent. Each option has a key,label,color,checked
  @Input()
  statusOptions?: Array<{
    key: string;
    label: string;
    color?: string;
    checked?: boolean;
  }> | null = null;

  // statusFilter holds boolean toggles keyed by status option key
  statusFilter: Record<string, boolean> = {};
  // internal normalized list and currently filtered view
  normalizedUsers: any[] = [];
  filteredUsersList: any[] = [];
  // side-menu state and selected user
  menuOpen = false;
  selectedUser: any = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['users']) {
      // normalize incoming data so template bindings are reliable
      this.normalizedUsers = (this.users || []).map((u) =>
        this.mapFn ? this.mapFn(u) : this.normalizeUser(u)
      );
      this.updateFiltered();
    }
    // when statusOptions changes, initialize statusFilter defaults
    if (changes['statusOptions']) {
      this.initializeStatusFilter();
      this.updateFiltered();
    }
  }

  // initialize defaults when no custom statusOptions provided
  private initializeStatusFilter() {
    // default options if parent didn't provide any
    if (!this.statusOptions || this.statusOptions.length === 0) {
      this.statusOptions = [
        { key: 'pending', label: 'Pending', checked: true },
        { key: 'approved', label: 'Approved', checked: false },
        { key: 'rejected', label: 'Rejected', checked: false },
      ];
    }

    // build statusFilter map from options
    this.statusFilter = {};
    for (const opt of this.statusOptions) {
      this.statusFilter[opt.key] = !!opt.checked;
    }
  }

  onSearchChange(value?: string) {
    // debounce input to avoid spamming updateFiltered on every keystroke
    if (this.searchTimer) clearTimeout(this.searchTimer);
    // update searchText from passed value (ngModelChange passes new value)
    if (value !== undefined) this.searchText = value;
    this.searchTimer = setTimeout(() => {
      this.updateFiltered();
      this.searchTimer = null;
    }, 220);
  }

  ngOnDestroy() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  updateFiltered() {
    const q = (this.searchText || '').trim().toLowerCase();
    // operate on normalized users
    // Build a list of active keys from the dynamic statusFilter map
    const activeKeys: string[] = [];
    for (const k of Object.keys(this.statusFilter)) {
      if (this.statusFilter[k]) activeKeys.push(k);
    }

    const matchesStatus = (u: any) => {
      // If no status filters selected, treat as all selected
      if (activeKeys.length === 0) return true;

      // check several user fields for a match: status (string), statusKey, statusLabel
      const candidates: string[] = [];
      if (u.status) candidates.push(String(u.status).toLowerCase());
      if (u.statusKey) candidates.push(String(u.statusKey).toLowerCase());
      if (u.statusLabel) candidates.push(String(u.statusLabel).toLowerCase());

      // also allow numeric statusCode to map to common keys (2->approved,3->rejected,1->pending)
      if (u.statusCode !== undefined && u.statusCode !== null) {
        const code = Number(u.statusCode);
        if (code === 2) candidates.push('approved');
        else if (code === 3) candidates.push('rejected');
        else candidates.push('pending');
      }

      for (const key of activeKeys) {
        const lk = String(key).toLowerCase();
        for (const c of candidates) if (c === lk) return true;
      }
      return false;
    };

    if (!q) {
      this.filteredUsersList = this.normalizedUsers.filter((u) =>
        matchesStatus(u)
      );
      return;
    }

    this.filteredUsersList = this.normalizedUsers.filter((u) => {
      const name = (
        (u.displayName || u.firstName || u.name || '') +
        ' ' +
        (u.lastName || '')
      ).toLowerCase();
      const email = (u.email || '').toString().toLowerCase();
      const tags = (u.specializations || []).join(' ').toLowerCase();
      const textMatch =
        name.includes(q) || email.includes(q) || tags.includes(q);
      return textMatch && matchesStatus(u);
    });
  }

  onStatusChange() {
    // re-run filtering when statuses toggled
    this.updateFiltered();
  }

  // Reset search and status filters to defaults and refresh view
  clearFilters() {
    this.searchText = '';
    // reset statusFilter to the checked defaults provided by statusOptions
    if (this.statusOptions && this.statusOptions.length) {
      for (const opt of this.statusOptions) {
        this.statusFilter[opt.key] = !!opt.checked;
      }
    } else {
      // fallback to sensible defaults
      this.statusFilter = {
        pending: true,
        approved: false,
        rejected: false,
      } as any;
    }
    // if there was a pending debounce timer, clear it
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.updateFiltered();
  }

  // placeholder actions (implement output/emitter or routing in parent if needed)
  viewUser(id: any) {
    this.action.emit({ action: 'view', user: { id } });
  }

  bookUser(id: any) {
    this.action.emit({ action: 'book', user: { id } });
  }

  // handler for dynamic buttons
  onActionClick(
    btn: { label: string; bg?: string; action?: string },
    user: any
  ) {
    const act = btn.action || btn.label.toLowerCase();
    this.action.emit({ action: act, user });
  }

  // Lightweight normalizer to make template bindings predictable.
  // Tries several common field names and nested shapes.
  private normalizeUser(item: any) {
    if (!item) return {};

    const pick = (candidates: any[]) => {
      for (const k of candidates) {
        try {
          if (typeof k === 'function') {
            const v = k(item);
            if (v !== undefined && v !== null) return v;
          } else {
            const v = item[k];
            if (v !== undefined && v !== null) return v;
          }
        } catch (e) {
          // ignore accessor errors
        }
      }
      return undefined;
    };

    const profilePic =
      pick([
        'profilePictureUrl',
        'avatar',
        'avatarUrl',
        'picture',
        'image',
        (it: any) => it.profile?.pictureUrl,
        (it: any) => it.profile?.avatar,
        (it: any) => it.photo?.url,
      ]) || '/assets/images/blank-avatar.webp';

    const firstName =
      pick([
        'firstName',
        'first_name',
        'fname',
        (it: any) => it.name?.split?.(' ')?.[0],
        'name',
      ]) || '';
    const lastName =
      pick([
        'lastName',
        'last_name',
        'lname',
        (it: any) => {
          if (it.name && typeof it.name === 'string')
            return it.name.split(' ').slice(1).join(' ');
          return undefined;
        },
      ]) || '';

    const displayName =
      pick([
        (it: any) =>
          it.firstName && it.lastName
            ? `${it.firstName} ${it.lastName}`
            : undefined,
        'displayName',
        'fullName',
        'name',
        'username',
        (it: any) => it.email,
      ]) ||
      (firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Unknown');

    const specializations =
      pick(['specializations', 'subjects', 'skills']) || [];

    const totalStudents = Number(
      pick(['totalStudents', 'studentsCount', 'students', 'total_students']) ||
        0
    );
    const averageRating =
      pick(['averageRating', 'rating', 'avgRating', 'average_rating']) || '-';
    const hourlyRate =
      pick(['hourlyRate', 'pricePerHour', 'rate', 'hour_rate']) || 0;
    const email = pick(['email', 'mail', 'contactEmail']) || '';
    const role = pick(['role', 'type', 'userType']) || '';
    const id = pick(['id', '_id', 'userId', 'teacherId']) || null;
    const rawStatus = pick(['status', 'state', 'accountStatus']) || 'pending';
    // determine numeric code and key
    let statusCode = parseInt(String(rawStatus), 10);
    if (Number.isNaN(statusCode)) {
      const s = String(rawStatus).toLowerCase();
      if (s.includes('pend')) statusCode = 1;
      else if (s.includes('reject') || s.includes('rej')) statusCode = 3;
      else if (
        s.includes('approve') ||
        s.includes('accept') ||
        s.includes('app')
      )
        statusCode = 2;
      else statusCode = 1;
    }
    const statusKey =
      statusCode === 2 ? 'approved' : statusCode === 3 ? 'rejected' : 'pending';
    const statusLabel =
      statusKey === 'approved'
        ? 'Approved'
        : statusKey === 'rejected'
        ? 'Rejected'
        : 'Pending';

    return {
      raw: item,
      id,
      firstName,
      lastName,
      name: displayName,
      displayName,
      profilePictureUrl: profilePic,
      role,
      specializations: Array.isArray(specializations)
        ? specializations
        : specializations
        ? [specializations]
        : [],
      totalStudents,
      averageRating,
      hourlyRate,
      email,
      status: String(rawStatus),
      statusCode,
      statusKey,
      statusLabel,
    };
  }

  // open the project's side-menu and show the selected user's details
  openProfile(user: any) {
    // Emit a 'view' action instead of opening the built-in menu
    this.action.emit({ action: 'view', user });
  }

  onMenuOpenChange(open: boolean) {
    this.menuOpen = !!open;
    if (!this.menuOpen) this.selectedUser = null;
  }

  // Format hourly rate for display. Returns '$0' for missing/zero values,
  // otherwise formats with up to 2 decimals and thousands separator.
  formatRate(val: any): string {
    const n = Number(val);
    if (!isFinite(n) || n === 0) return '$0';
    // show without trailing zeros if integer, otherwise up to 2 decimals
    const opts: Intl.NumberFormatOptions =
      n % 1 === 0
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
    return '$' + n.toLocaleString(undefined, opts);
  }
}
