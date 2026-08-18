import axios from 'axios'
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL || 'http://localhost:8000',withCredentials:true})
api.interceptors.request.use(c=>{const token=localStorage.getItem('access_token');if(token)c.headers.Authorization=`Bearer ${token}`;return c})
api.interceptors.response.use(r=>r,async err=>{const old=err.config;if(err.response?.status===401&&!old._retry){old._retry=true;try{const {data}=await api.post('/auth/refresh');localStorage.setItem('access_token',data.access_token);old.headers.Authorization=`Bearer ${data.access_token}`;return api(old)}catch{localStorage.removeItem('access_token')}}return Promise.reject(err)})
export const message=(e:unknown)=>axios.isAxiosError(e)?e.response?.data?.error?.message || 'Request failed.':'Something went wrong.'
