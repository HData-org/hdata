const HData = require('./hdata.js').HData;
const conn = new HData();
conn.status(function(res, err) {
	console.log(res);
	conn.login("root", "changeme", function(res, err) {
		console.log(res);
		conn.createUser("herronjo", "password", ["getkey"], function(res, err) {
			console.log(res);
			conn.getUser("herronjo", function(res, err) {
				console.log(res);
				conn.updateUser("herronjo", "awesome", true, function(res, err) {
					console.log(res);
					conn.getUser("herronjo", function(res, err) {
						console.log(res);
						conn.updatePassword("herronjo", "password2", function(res, err) {
							console.log(res);
							conn.deleteUser("herronjo", function(res, err) {
								console.log(res);
								conn.getUser("herronjo", function(res, err) {
									console.log(res);
									conn.createTable("test", function(res, err) {
										console.log(res);
										conn.setKey("test", "bruh", "moment", function(res, err) {
											console.log(res);
											conn.getKey("test", "bruh", function(res, err) {
												console.log(res);
												conn.queryAll("true", function(res, err) {
													console.log(res);
													conn.getTables(function(res, err) {
														console.log(res);
														conn.queryTable("test", "true", function(res, err) {
															console.log(res);
															conn.tableSize("test", function(res, err) {
																console.log(res);
																conn.tableKeys("test", function(res, err) {
																	console.log(res);
																	conn.deleteKey("test", "bruh", function(res, err) {
																		console.log(res);
																		conn.getKey("test", "bruh", function(res, err) {
																			console.log(res);
																			conn.tableExists("test", function(res, err) {
																				console.log(res);
																				conn.deleteTable("test", function(res, err) {
																					console.log(res);
																					conn.getKey("test", "bruh", function(res, err) {
																						console.log(res);
																						conn.logout(function(res, err) {
																							console.log(res);
																							conn.close(function(res, err) {
																								console.log(res);
																							});
																						});
																					});
																				});
																			});
																		});
																	});
																});
															});
														});
													});
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});