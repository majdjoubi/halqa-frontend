import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { AllTeachersComponent } from './all-teachers.component';
import { RepoService } from '../../../Repositories/repo.service';
import { of } from 'rxjs';

describe('AllTeachersComponent', () => {
  let component: AllTeachersComponent;
  let fixture: ComponentFixture<AllTeachersComponent>;
  let repoSpy: jasmine.SpyObj<RepoService>;

  beforeEach(async () => {
    repoSpy = jasmine.createSpyObj('RepoService', ['getAllTeachers']);

    await TestBed.configureTestingModule({
      imports: [AllTeachersComponent],
      providers: [
        { provide: RepoService, useValue: repoSpy },
        // Force SSR mode in this spec so the component uses backend-only paging
        // (avoids browser-only availability computation and keeps this test focused).
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllTeachersComponent);
    component = fixture.componentInstance;

    // ngOnInit triggers several unrelated calls that depend on other services.
    // Stub them so this spec only tests pagination behavior.
    spyOn<any>(component, 'loadSpecializations').and.callFake(() => undefined);
    spyOn<any>(component, 'loadStudentExistingBookings').and.callFake(() => undefined);
    spyOn<any>(component, 'loadWalletBalance').and.callFake(() => undefined);
    spyOn<any>(component, 'refreshAvailableLessonsBalance').and.callFake(() => undefined);
  });

  it('should load first page on init', () => {
    const mockResp = { teachers: [{ firstName: 'A' }], totalCount: 12 };
    repoSpy.getAllTeachers.and.returnValue(of(mockResp));

    fixture.detectChanges(); // triggers ngOnInit

    expect(repoSpy.getAllTeachers).toHaveBeenCalledWith(1, component.pageSize);
    expect(component.allTeachers.length).toBe(1);
    expect(component.AllTeacherCount).toBe(12);
    expect(component.totalPages).toBe(Math.ceil(12 / component.pageSize));
  });

  it('should go to next page when goToPage called', () => {
    const mockResp1 = { teachers: [{ firstName: 'A' }], totalCount: 12 };
    const mockResp2 = { teachers: [{ firstName: 'B' }], totalCount: 12 };
    repoSpy.getAllTeachers.and.returnValues(of(mockResp1), of(mockResp2));

    fixture.detectChanges();
    expect(component.currentpage).toBe(1);

    component.goToPage(2);
    expect(repoSpy.getAllTeachers).toHaveBeenCalledWith(2, component.pageSize);
    expect(component.currentpage).toBe(2);
  });
});
