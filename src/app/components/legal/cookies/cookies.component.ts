import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CookieConsentService } from '../../../services/consent/cookie-consent.service';

@Component({
  selector: 'app-cookies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cookies.component.html',
  styleUrl: './cookies.component.scss',
})
export class CookiesComponent implements OnInit {
  necessary = true;
  marketing = false;
  hasDecision = false;

  showSettings = true;

  constructor(
    private consent: CookieConsentService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const snapshot = this.consent.snapshot;
    this.hasDecision = !!snapshot;
    this.marketing = !!snapshot?.marketing;

    const settingsParam = this.route.snapshot.queryParamMap.get('settings');
    this.showSettings = settingsParam !== '0';
  }

  save(): void {
    // Necessary cookies are always enabled.
    this.consent.setMarketingAllowed(this.marketing);
    this.hasDecision = true;
  }

  acceptAll(): void {
    this.marketing = true;
    this.save();
  }

  rejectNonEssential(): void {
    this.marketing = false;
    this.save();
  }
}
