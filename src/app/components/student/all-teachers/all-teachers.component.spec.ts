import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      providers: [{ provide: RepoService, useValue: repoSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(AllTeachersComponent);
    component = fixture.componentInstance;
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
