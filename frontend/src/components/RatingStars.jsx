import { useId } from 'react';

export default function RatingStars({ rating, decorative = false }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const score = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  return <span className="rating-stars" role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${score.toLocaleString('es-CO')} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((star) => {
      const fill = `${Math.max(0, Math.min(1, score - star + 1)) * 100}%`;
      return <svg key={star} viewBox="0 0 24 24" aria-hidden="true" className={star <= score ? 'is-filled' : ''} style={{ fill: `url(#${id}-${star})` }}><defs><linearGradient id={`${id}-${star}`}><stop offset={fill} stopColor="#ba903f" /><stop offset={fill} stopColor="#e4e2d8" /></linearGradient></defs><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z" /></svg>;
    })}
  </span>;
}
