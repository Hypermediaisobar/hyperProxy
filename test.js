	var tests = [
		[
			'kasia',
			'basia',
			'asia'
		],
		[
			'asiaa',
			'asiab',
			'asia'
		],
		[
			'foo',
			'bar',
			'baz',
			'quux'
		],
		[
			'Clojure',
			'Clojars',
			'ClojureScript'
		],
		[
			'skill',
			'skills',
			'skull',
			'skulls'
		]
	];

	var builder = require('./lib/RegExpBuilder.js')();
	var i, source, check;
	for (i = 0; i < tests.length; i++) {
		builder.reset();
		source = '^' + builder.build(tests[i]) + '$';
		check = new RegExp(source);
		console.log(source);
		tests[i].forEach(function(value, index){
			console.log(value+'... '+(check.test(value) ? 'TRUE' : 'FALSE'));
		});
	}