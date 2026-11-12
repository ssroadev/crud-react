import { useEffect, useRef, useState } from 'react';
import { getCaregiverReviews } from '../api';
import RatingStars from './RatingStars';
import '../reviews.css';

const dateLabel = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(value)) : '';

export default function CaregiverReviews({ caregiverId, onSummary }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const moreRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getCaregiverReviews(caregiverId, {}, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setData(result); onSummary(result.summary); setError(null); }
    }).catch((err) => { if (!controller.signal.aborted) setError({ message: err.message, more: false }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [caregiverId, revision, onSummary]);

  const loadMore = async () => {
    if (loadingMore || !data?.next_cursor) return;
    const controller = new AbortController(); moreRequest.current = controller;
    setLoadingMore(true); setError(null);
    try {
      const result = await getCaregiverReviews(caregiverId, { before_id: data.next_cursor }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData((current) => ({ ...result, reviews: [...new Map([...current.reviews, ...result.reviews].map((review) => [review.id, review])).values()] }));
        onSummary(result.summary);
      }
    } catch (err) { if (!controller.signal.aborted) setError({ message: err.message, more: true }); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  const retry = () => {
    if (error?.more) { loadMore(); return; }
    setLoading(true); setError(null); setRevision((value) => value + 1);
  };

  return <section id={`caregiver-reviews-${caregiverId}`} className="caregiver-reviews" aria-label="Opiniones de otros dueños" aria-busy={loading}>
    <div className="reviews-heading"><div><p className="eyebrow">Experiencias que dan confianza</p><h4>Opiniones de otros dueños</h4></div><span className="completed-review-label">Servicios completados</span></div>
    <p className="reviews-explanation">Cada valoración está vinculada a un servicio real completado con este cuidador.</p>
    {loading ? <p className="reviews-loading" role="status">Cargando opiniones…</p> : <>
      {data?.summary.review_count > 0 && <>
        <div className="reviews-summary"><div className="review-score"><strong>{data.summary.rating.toLocaleString('es-CO')}</strong><span>de 5</span><RatingStars rating={data.summary.rating} /><small>{data.summary.review_count} {data.summary.review_count === 1 ? 'valoración' : 'valoraciones'}</small></div>
          <ul className="review-distribution" aria-label="Distribución de las valoraciones">{[5, 4, 3, 2, 1].map((rating) => <li key={rating} aria-label={`${rating} estrellas: ${data.summary.distribution[rating] || 0} valoraciones`}><span aria-hidden="true">{rating} ★</span><div aria-hidden="true"><span style={{ width: `${(data.summary.distribution[rating] || 0) / data.summary.review_count * 100}%` }} /></div><small aria-hidden="true">{data.summary.distribution[rating] || 0}</small></li>)}</ul>
        </div>
        <ol className="public-review-list">{data.reviews.map((review) => <li key={review.id}><article className="public-review"><header><span className="review-author-avatar" aria-hidden="true">{review.author_name[0]}</span><div><strong>{review.author_name}</strong>{dateLabel(review.created_at) && <time dateTime={review.created_at}>{dateLabel(review.created_at)}</time>}</div><RatingStars rating={review.rating} /></header><p className="review-service">{review.service_name} <span>· Servicio completado</span></p>{review.comment ? <p className="review-comment">{review.comment}</p> : <p className="review-no-comment">No dejó un comentario escrito.</p>}</article></li>)}</ol>
        {data.has_more && <button type="button" className="secondary reviews-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando…' : 'Ver más opiniones'}</button>}
      </>}
      {data?.summary.review_count === 0 && !error && <div className="reviews-empty"><RatingStars rating={0} decorative /><h5>Todavía no tiene opiniones</h5><p>Aquí aparecerán las experiencias que compartan los dueños tras un servicio completado.</p></div>}
    </>}
    {error && <div className="reviews-error" role="alert"><p>{error.message}</p><button type="button" className="secondary" disabled={loadingMore} onClick={retry}>Reintentar opiniones</button></div>}
  </section>;
}
