export default function NotFound(){ 
  return (
    <article className="p-6" aria-labelledby="notfound-title">
      <h1 id="notfound-title" className="text-xl font-bold">404 - Not Found</h1>
      <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
    </article>
  ); 
}