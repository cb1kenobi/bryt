const bryt = require('../src/index');

describe('getBrightness()', () => {
	it('should error if brightness is not an integer', () => {
		expect(() => {
			bryt.getBrightness('foo');
		}).to.throw(TypeError, 'Expected brightness to be an integer');

		expect(() => {
			bryt.getBrightness(123.45);
		}).to.throw(TypeError, 'Expected brightness to be an integer');
	});

	it('should error if brightness not in the valid range', () => {
		expect(() => {
			bryt.getBrightness(-10);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');

		expect(() => {
			bryt.getBrightness(1000);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');
	});

	it('should get info for a specific brightness', () => {
		const info = bryt.getBrightness(0);
		expect(info).to.be.an('object');
		expect(info).to.have.property('brightness', 0);
		expect(info).to.have.property('count', 26);

		expect(info.getColor(10)).to.equal(257);
		expect(() => {
			info.getColor('foo');
		}).to.throw(TypeError, 'Expected index to be an integer');
		expect(() => {
			info.getColor(-123);
		}).to.throw(RangeError, 'Expected index to be a positive integer');

		const colors = info.getColors();
		expect(colors).to.be.an('array');
		expect(colors).to.have.lengthOf(26);
	});
});

describe('getColor()', () => {
	it('should error if brightness is not a number', () => {
		expect(() => {
			bryt.getColor('foo');
		}).to.throw(TypeError, 'Expected brightness to be an integer');

		expect(() => {
			bryt.getColor(123.45);
		}).to.throw(TypeError, 'Expected brightness to be an integer');
	});

	it('should error if brightness not in the valid range', () => {
		expect(() => {
			bryt.getColor(-10);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');

		expect(() => {
			bryt.getColor(1000);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');
	});

	it('should error if index is not an integer', () => {
		expect(() => {
			bryt.getColor(0, 'foo');
		}).to.throw(TypeError, 'Expected index to be an integer');

		expect(() => {
			bryt.getColor(0, 123.45);
		}).to.throw(TypeError, 'Expected index to be an integer');
	});

	it('should error if index is negative', () => {
		expect(() => {
			bryt.getColor(0, -19);
		}).to.throw(RangeError, 'Expected index to be a positive integer');
	});

	it('should get a color', () => {
		expect(bryt.getColor(0, 0)).to.equal(0);
		expect(bryt.getColor(128, 10)).to.equal(43775);
	});
});

describe('getColors()', () => {
	it('should error if brightness is not a number', () => {
		expect(() => {
			bryt.getColors('foo');
		}).to.throw(TypeError, 'Expected brightness to be an integer');

		expect(() => {
			bryt.getColors(123.45);
		}).to.throw(TypeError, 'Expected brightness to be an integer');
	});

	it('should error if brightness not in the valid range', () => {
		expect(() => {
			bryt.getColors(-10);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');

		expect(() => {
			bryt.getColors(1000);
		}).to.throw(RangeError, 'Expected brightness to be between 0 and 255');
	});

	it('should get all colors for a brightness', () => {
		const colors = bryt.getColors(128);
		expect(colors).to.be.an('array');
		expect(colors).to.have.lengthOf(111648);
	});
});

describe('toRGB()', () => {
	it('should error if the color is invalid', () => {
		expect(() => {
			bryt.toRGB('foo');
		}).to.throw(TypeError, 'Expected color to be an integer');

		expect(() => {
			bryt.toRGB(123.45);
		}).to.throw(TypeError, 'Expected color to be an integer');
	});

	it('should error if the color is negative', () => {
		expect(() => {
			bryt.toRGB(-10);
		}).to.throw(RangeError, 'Expected color to be a positive integer');
	});

	it('should convert a color to RGB', () => {
		expect(bryt.toRGB(123)).to.deep.equal([ 0, 0, 123 ]);
		expect(bryt.toRGB(64326)).to.deep.equal([ 0, 251, 70 ]);
		expect(bryt.toRGB(1468399)).to.deep.equal([ 22, 103, 239 ]);
	});
});
