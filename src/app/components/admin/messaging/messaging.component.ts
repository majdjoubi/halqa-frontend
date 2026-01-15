import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { RepoService } from '../../../Repositories/repo.service';
import { catchError, finalize, of } from 'rxjs';

type AudienceType =
  | 'all_teachers'
  | 'all_students'
  | 'all_users'
  | 'custom_list'
  | 'single_email';

type SendTiming = 'now' | 'schedule';

interface AdminUserLite {
  id?: string;
  email: string;
  name?: string;
  role?: number | string;
  firstName?: string;
}

@Component({
  selector: 'app-admin-messaging',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, QuillModule],
  templateUrl: './messaging.component.html',
  styleUrl: './messaging.component.scss',
})
export class MessagingComponent {
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly campaignsLoading = signal(false);
  readonly campaigns = signal<any[]>([]);
  readonly selectedCampaign = signal<any | null>(null);
  readonly selectedCampaignCounts = signal<any | null>(null);

  readonly usersLoading = signal(false);
  readonly users = signal<AdminUserLite[]>([]);

  readonly spamIssues = signal<string[]>([]);

  readonly quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ align: [] }],
      ['link'],
      ['clean'],
    ],
  };

  readonly editorPlaceholder = 'Write your message…';

  form: FormGroup<{
    audienceType: FormControl<AudienceType>;
    singleEmail: FormControl<string>;
    customEmails: FormControl<string[]>;
    subject: FormControl<string>;
    htmlBody: FormControl<string>;
    timing: FormControl<SendTiming>;
    scheduledAt: FormControl<string>;
    testSend: FormControl<boolean>;
    testEmail: FormControl<string>;
  }>;

  readonly footerHtml = computed(() => {
    // Server will always append a mandatory footer; this is a preview for admins.
    // Physical address and unsubscribe URL are enforced server-side.
    return `\n<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>\n<div style="font-size:12px;color:#6b7280;line-height:1.4">\n  <div><strong>Halqa</strong></div>\n  <div>Unsubscribe: <em>(one-click link will be added automatically)</em></div>\n  <div>Address: <em>(physical address will be added automatically)</em></div>\n</div>`;
  });

  readonly finalHtmlPreview = computed(() => {
    const body = this.form.controls.htmlBody.value || '';
    return `${body}${this.footerHtml()}`;
  });

  constructor(private fb: FormBuilder, private repo: RepoService) {
    this.form = this.fb.nonNullable.group({
      audienceType: this.fb.nonNullable.control<AudienceType>('all_users'),
      singleEmail: this.fb.nonNullable.control('', [Validators.email]),
      customEmails: this.fb.nonNullable.control<string[]>([]),
      subject: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.maxLength(160),
      ]),
      htmlBody: this.fb.nonNullable.control('', [Validators.required]),
      timing: this.fb.nonNullable.control<SendTiming>('now'),
      scheduledAt: this.fb.nonNullable.control(''),
      testSend: this.fb.nonNullable.control(false),
      testEmail: this.fb.nonNullable.control('', [Validators.email]),
    });

    this.form.controls.audienceType.valueChanges.subscribe((aud) => {
      if (aud === 'single_email') {
        this.form.controls.singleEmail.addValidators([Validators.required]);
      } else {
        this.form.controls.singleEmail.removeValidators([Validators.required]);
        this.form.controls.singleEmail.setValue('');
      }
      this.form.controls.singleEmail.updateValueAndValidity({ emitEvent: false });

      if (aud === 'custom_list') {
        // allow empty while building list, validate on send
        this.loadUsersIfNeeded();
      } else {
        this.form.controls.customEmails.setValue([]);
      }
    });

    this.form.controls.timing.valueChanges.subscribe((timing) => {
      if (timing === 'schedule') {
        this.form.controls.scheduledAt.addValidators([Validators.required]);
      } else {
        this.form.controls.scheduledAt.removeValidators([Validators.required]);
        this.form.controls.scheduledAt.setValue('');
      }
      this.form.controls.scheduledAt.updateValueAndValidity({ emitEvent: false });
    });

    this.form.controls.testSend.valueChanges.subscribe((checked) => {
      if (checked) {
        this.form.controls.testEmail.addValidators([Validators.required]);
        const extracted = this.tryExtractEmailFromToken();
        if (extracted && !this.form.controls.testEmail.value) {
          this.form.controls.testEmail.setValue(extracted);
        }
      } else {
        this.form.controls.testEmail.removeValidators([Validators.required]);
      }
      this.form.controls.testEmail.updateValueAndValidity({ emitEvent: false });
    });

    this.refreshCampaigns();
  }

  refreshCampaigns(): void {
    this.campaignsLoading.set(true);
    this.repo
      .adminMessagingListCampaigns({ page: 1, pageSize: 50 })
      .pipe(
        catchError((err) => {
          console.error(err);
          return of({ campaigns: [] });
        }),
        finalize(() => this.campaignsLoading.set(false))
      )
      .subscribe((resp) => {
        this.campaigns.set(resp?.campaigns || []);
      });
  }

  selectCampaign(id: string): void {
    this.selectedCampaign.set(null);
    this.selectedCampaignCounts.set(null);
    if (!id) return;

    this.repo
      .adminMessagingGetCampaign(id)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.error.set(err?.error?.message || 'Failed to load campaign.');
          return of(null);
        })
      )
      .subscribe((resp) => {
        if (!resp) return;
        this.selectedCampaign.set(resp.campaign || null);
        this.selectedCampaignCounts.set(resp.counts || null);
      });
  }

  audienceLabel(audience: AudienceType): string {
    switch (audience) {
      case 'all_teachers':
        return 'All Teachers';
      case 'all_students':
        return 'All Students';
      case 'all_users':
        return 'All Users';
      case 'custom_list':
        return 'Custom List';
      case 'single_email':
        return 'Single Email';
    }
  }

  toggleCustomEmail(email: string, checked: boolean): void {
    const current = new Set(this.form.controls.customEmails.value || []);
    if (checked) current.add(email);
    else current.delete(email);
    this.form.controls.customEmails.setValue(Array.from(current));
  }

  isCustomEmailSelected(email: string): boolean {
    return (this.form.controls.customEmails.value || []).includes(email);
  }

  loadUsersIfNeeded(): void {
    if (this.users().length > 0 || this.usersLoading()) return;

    this.usersLoading.set(true);
    this.repo
      .getAllUsers()
      .pipe(
        catchError((err) => {
          console.error(err);
          this.error.set('Failed to load users for custom list.');
          return of([] as any[]);
        }),
        finalize(() => this.usersLoading.set(false))
      )
      .subscribe((rows: any[]) => {
        const mapped: AdminUserLite[] = (rows || [])
          .map((u) => ({
            id: u?.id || u?._id,
            email: u?.email,
            name: u?.name,
            role: u?.role,
            firstName: u?.firstName || u?.first_name,
          }))
          .filter((u) => !!u.email);
        this.users.set(mapped);
      });
  }

  send(): void {
    this.error.set(null);
    this.success.set(null);

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Please fix validation errors.');
      return;
    }

    const issues = this.scanForSafetyIssues(
      this.form.controls.htmlBody.value || ''
    );
    this.spamIssues.set(issues);
    if (issues.length > 0) {
      this.error.set('Message blocked by safety rules.');
      return;
    }

    const audienceType = this.form.controls.audienceType.value;
    if (audienceType === 'custom_list') {
      const list = this.form.controls.customEmails.value || [];
      if (list.length === 0) {
        this.error.set('Select at least one user for the custom list.');
        return;
      }
    }

    const payload: any = {
      audience_type: audienceType,
      subject: this.form.controls.subject.value,
      html_body: this.form.controls.htmlBody.value,
      timing: this.form.controls.timing.value,
      scheduled_at:
        this.form.controls.timing.value === 'schedule'
          ? this.form.controls.scheduledAt.value
          : null,
      test_send: this.form.controls.testSend.value,
      test_email: this.form.controls.testSend.value
        ? this.form.controls.testEmail.value
        : null,
      custom_emails:
        audienceType === 'custom_list'
          ? this.form.controls.customEmails.value
          : null,
      single_email:
        audienceType === 'single_email'
          ? this.form.controls.singleEmail.value
          : null,
    };

    this.sending.set(true);
    this.repo
      .adminMessagingCreateCampaign(payload)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.error.set(
            err?.error?.message || 'Failed to create messaging campaign.'
          );
          return of(null);
        }),
        finalize(() => this.sending.set(false))
      )
      .subscribe((result) => {
        if (!result) return;
        this.success.set('Campaign queued successfully.');
        this.refreshCampaigns();
      });
  }

  private scanForSafetyIssues(html: string): string[] {
    const issues: string[] = [];

    // Block image-only (no meaningful text)
    const textOnly = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim();

    const hasImage = /<img\b/i.test(html);
    if (hasImage && textOnly.length < 20) {
      issues.push('Image-only emails are blocked. Add meaningful text.');
    }

    // Block URL shorteners
    const shorteners = [
      'bit.ly',
      't.co',
      'tinyurl.com',
      'goo.gl',
      'ow.ly',
      'is.gd',
      'buff.ly',
      'cutt.ly',
      'rebrand.ly',
    ];
    const lower = html.toLowerCase();
    if (shorteners.some((d) => lower.includes(d))) {
      issues.push('URL shorteners are blocked. Use full URLs.');
    }

    // Basic spam phrase scan (lightweight client-side gate; server also enforces)
    const spamPhrases = [
      'act now',
      'free money',
      'guaranteed',
      'urgent',
      'click here',
      'limited time',
      'risk-free',
      'winner',
    ];
    if (spamPhrases.some((p) => lower.includes(p))) {
      issues.push('Contains spam-like phrases. Please rewrite.');
    }

    return issues;
  }

  private tryExtractEmailFromToken(): string | null {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const email = payload?.email;
      return typeof email === 'string' ? email : null;
    } catch {
      return null;
    }
  }

  getFieldError(control: AbstractControl | null): string | null {
    if (!control) return null;
    if (!control.touched || !control.errors) return null;
    if (control.errors['required']) return 'Required';
    if (control.errors['email']) return 'Invalid email';
    if (control.errors['maxlength']) return 'Too long';
    return 'Invalid';
  }
}
