import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService, Language } from '../../services/language.service';
import { Subscription } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
  currentLanguage: Language;
  private languageSubscription: Subscription;
  mobileMenuOpen = false;
  showNavbar = true;
  hiddenRoutes = [
    '/join-us',
    '/student-register',
    '/forgot-password',
    '/verify-otp',
    '/set-password',
    '/login',
    '/teacher-register',
    '/teacher-create-profile',
    '/dashboard',
  ];
  constructor(
    private languageService: LanguageService,
    private router: Router
  ) {
    this.currentLanguage = this.languageService.currentLanguage;
    this.languageSubscription = new Subscription();
    this.router.events.subscribe(() => {
      this.showNavbar = !this.hiddenRoutes.includes(this.router.url);
    });
  }
}
