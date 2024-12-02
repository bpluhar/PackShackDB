import React from 'react';
import PropTypes from 'prop-types';

const Section = ({
  id,
  title,
  className = '',
  children,
  titleSize = '2xl'
}) => (
  <section
    className={`p-8 ${className}`}
    aria-labelledby={id}
  >
    <div>
      <h2
        id={id}
        className={`text-${titleSize} font-semibold text-gray-800 mb-6`}
      >
        {title}
      </h2>
      {children}
    </div>
  </section>
);

Section.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
  titleSize: PropTypes.oneOf(['sm', 'lg', 'xl', '2xl', '3xl']),
};

// Remove defaultProps entirely as we're using default parameters

export default Section;