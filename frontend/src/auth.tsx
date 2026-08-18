import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {api} from './api'
type User={id:number;name:string;email:string;student_id:string;role:'STUDENT'|'ADMIN'|'KITCHEN_STAFF'}
type Auth={user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;logout:()=>Promise<void>}
const Context=createContext<Auth>(null!)
export const useAuth=()=>useContext(Context)
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true)
 useEffect(()=>{api.get('/auth/me').then(r=>setUser(r.data)).catch(()=>localStorage.removeItem('access_token')).finally(()=>setLoading(false))},[])
 const login=async(email:string,password:string)=>{const {data}=await api.post('/auth/login',{email,password});localStorage.setItem('access_token',data.access_token);setUser(data.user)}
 const logout=async()=>{await api.post('/auth/logout');localStorage.removeItem('access_token');setUser(null)}
 return <Context.Provider value={{user,loading,login,logout}}>{children}</Context.Provider>}
