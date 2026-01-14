import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RepoService } from '../../Repositories/repo.service';
import { catchError, finalize, of } from 'rxjs';

@Component({
  selector: 'app-unsubscribe',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './unsubscribe.component.html',
  styleUrl: './unsubscribe.component.scss',
})
export class UnsubscribeComponent {
  readonly loading = signal(true);
  readonly ok = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private route: ActivatedRoute, private repo: RepoService) {
    const token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!token) {
      this.loading.set(false);
      this.error.set('Missing unsubscribe token.');
      return;
    }

    this.repo
      .unsubscribe(token)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.error.set(err?.error?.message || 'Unsubscribe failed.');
          return of(null);
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((resp) => {
        if (resp?.ok) this.ok.set(true);
      });
  }
}
