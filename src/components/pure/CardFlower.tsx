import Image from "next/image";
import React from "react";

const CardFlower = ({ className = "", openAmount = 100, src = "" }) => {
  // Clamp the openAmount between 0 and 100
  const clampedAmount = Math.max(0, Math.min(100, openAmount));
  const factor = clampedAmount / 100;

  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .card-fan-container {
          position: relative;
          width: 100%;
          height: 100%;
          min-width: 60px;
          min-height: 60px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-fan-card {
          position: absolute;
          width: 60px;
          height: 60px;
          background: linear-gradient(145deg, #ffffff, #f0f0f0);
          border-radius: 8px;
          box-shadow: 
            0 1px 6px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
          transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transform-origin: bottom center;
          border: 2px solid #ddd;
          overflow: hidden;
        }

        .card-fan-card.has-image {
          background: #ffffff;
        }

        .card-fan-card.has-image::before {
          display: none;
        }

        .card-fan-card.has-image::after {
          display: none;
        }

        .card-fan-card::before {
          content: '';
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          bottom: 8px;
          background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #ffeaa7);
          background-size: 400% 400%;
          border-radius: 5px;
          animation: gradientShift 8s ease infinite;
          opacity: 0.8;
        }

        .card-fan-card::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 20px;
          height: 20px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        /* Posicionamiento inicial de las cartas (cerrado) */
        .card-fan-card:nth-child(1) {
          z-index: 5;
          transform: rotate(-2deg) translateY(0px);
        }

        .card-fan-card:nth-child(2) {
          z-index: 4;
          transform: rotate(-1deg) translateY(2px);
        }

        .card-fan-card:nth-child(3) {
          z-index: 3;
          transform: rotate(0deg) translateY(4px);
        }

        .card-fan-card:nth-child(4) {
          z-index: 2;
          transform: rotate(1deg) translateY(6px);
        }

        .card-fan-card:nth-child(5) {
          z-index: 1;
          transform: rotate(2deg) translateY(8px);
        }

        /* Animación al hacer hover */
        .card-fan-container:hover .card-fan-card:nth-child(1) {
          transform: rotate(${-45 * factor}deg) translateY(${
        -8 * factor
      }px) translateX(${-25 * factor}px);
          z-index: 5;
        }

        .card-fan-container:hover .card-fan-card:nth-child(2) {
          transform: rotate(${-22 * factor}deg) translateY(${
        -4 * factor
      }px) translateX(${-12 * factor}px);
          z-index: 4;
        }

        .card-fan-container:hover .card-fan-card:nth-child(3) {
          transform: rotate(0deg) translateY(0px) translateX(0px);
          z-index: 3;
        }

        .card-fan-container:hover .card-fan-card:nth-child(4) {
          transform: rotate(${22 * factor}deg) translateY(${
        -4 * factor
      }px) translateX(${12 * factor}px);
          z-index: 2;
        }

        .card-fan-container:hover .card-fan-card:nth-child(5) {
          transform: rotate(${45 * factor}deg) translateY(${
        -8 * factor
      }px) translateX(${25 * factor}px);
          z-index: 1;
        }

        .card-fan-container:hover .card-fan-card {
          box-shadow: 
            0 2px 6px rgba(0, 0, 0, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        }

        .card-fan-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 6px;
        }

        .card-fan-title {
          position: absolute;
          top: -40px;
          left: 50%;
          transform: translateX(-50%);
          color: #333;
          font-size: clamp(12px, 3vw, 16px);
          font-weight: bold;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
          opacity: 0.8;
          white-space: nowrap;
          pointer-events: none;
        }
      `}</style>

      <div className={`card-fan-container ${className}`}>
        <div className={`card-fan-card ${src ? "has-image" : ""}`}>
          {src && (
            <Image src={src} alt="Card image" className="card-fan-image" width={60} height={60} />
          )}
        </div>
        <div className="card-fan-card"></div>
        <div className="card-fan-card"></div>
        <div className="card-fan-card"></div>
        <div className="card-fan-card"></div>
      </div>
    </>
  );
};
export default CardFlower;