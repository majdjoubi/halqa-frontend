import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environment/environment';

@Injectable({
  providedIn: 'root',
})
export class TestApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * اختبار GET request مع التوكن
   */
  testGetRequest(): Observable<any> {
    return this.http.get(`${this.apiUrl}/test`);
  }

  /**
   * اختبار POST request مع التوكن
   */
  testPostRequest(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/test`, data);
  }

  /**
   * اختبار PUT request مع التوكن
   */
  testPutRequest(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/test/${id}`, data);
  }

  /**
   * اختبار DELETE request مع التوكن
   */
  testDeleteRequest(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/test/${id}`);
  }

  /**
   * اختبار external API (لاختبار الـ interceptor مع APIs خارجية)
   */
  testExternalApi(): Observable<any> {
    return this.http.get('https://jsonplaceholder.typicode.com/posts/1');
  }
}
